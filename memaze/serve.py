#!/usr/bin/env python3
"""Memaze local server - Python 3.8+, standard library only.

Serves the Memaze game (the files next to this script) plus the player's own
media (sprite, background, win/lose animations, goal, music) and a tiny JSON
API the game uses to list, upload and delete that media.

Usage:
    python3 serve.py [--port 8765] [--host 127.0.0.1] [--media PATH]
                     [--no-open] [--read-only] [--verbose]

    --host 0.0.0.0   also let phones/tablets on the same Wi-Fi play
    --media PATH     keep the media folders somewhere else (default: ./media)
    --read-only      refuse uploads/deletes coming from the browser
    --no-open        don't open a browser tab on start

Media lives in <media>/<slot>/ with slot in SLOTS. Drop files in at any time:
the game polls /api/media and picks up changes by watching "rev".

API (JSON):
    GET    /api/ping                -> {ok, app, version, writable, slots, mediaDir}
    GET    /api/media               -> {rev, slots: {slot: [item, ...]}}
    POST   /api/media/<slot>        body = raw file bytes, X-Filename = %-encoded name
                                    -> 201 {item}
    DELETE /api/media/<slot>/<name> -> {ok: true}
    item = {name, url, kind: image|video|audio, size, mtime}
    Errors: {error: "..."} with a 4xx/5xx status.
"""

import argparse
import hashlib
import json
import os
import re
import socket
import sys
import tempfile
import threading
import unicodedata
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, unquote, urlsplit

APP_DIR = os.path.dirname(os.path.abspath(__file__))
SLOTS = ["player", "background", "win", "lose", "goal", "music"]
KINDS = {
    "image": ("png", "jpg", "jpeg", "gif", "webp", "avif", "apng", "svg", "bmp", "ico"),
    "video": ("mp4", "m4v", "webm", "mov", "ogv"),
    "audio": ("mp3", "ogg", "oga", "opus", "wav", "m4a", "aac", "flac"),
}
EXT_KIND = {ext: kind for kind, exts in KINDS.items() for ext in exts}
UTF8 = "; charset=utf-8"
MIME = {
    ".html": "text/html" + UTF8, ".htm": "text/html" + UTF8, ".js": "text/javascript" + UTF8,
    ".mjs": "text/javascript" + UTF8, ".css": "text/css" + UTF8, ".txt": "text/plain" + UTF8,
    ".json": "application/json", ".map": "application/json", ".wasm": "application/wasm",
    ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".woff": "font/woff",
    ".ttf": "font/ttf", ".otf": "font/otf",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".apng": "image/apng",
    ".bmp": "image/bmp", ".ico": "image/x-icon",
    ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".ogv": "video/ogg", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".oga": "audio/ogg",
    ".opus": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac",
    ".flac": "audio/flac",
}
MAX_UPLOAD = 1 << 30          # 1 GiB
MAX_NAME = 120
CHUNK = 256 * 1024
BAD_NAME_CHARS = set('/\\:*?"<>|')
WIN_RESERVED = {"CON", "PRN", "AUX", "NUL"} | {p + str(i) for p in ("COM", "LPT") for i in range(1, 10)}
QUIET_ERRORS = (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, socket.timeout)
RANGE_RE = re.compile(r"\s*bytes\s*=\s*([0-9]*)\s*-\s*([0-9]*)\s*")


def ext_of(name):
    return os.path.splitext(name)[1][1:].lower()


def safe_segment(seg):
    """A decoded URL path segment that is a plain, visible file/folder name."""
    return bool(seg) and not seg.startswith(".") and not any(c in seg for c in "/\\:\0")


def sanitize_filename(raw):
    name = unicodedata.normalize("NFC", raw).replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(c for c in name if c not in BAD_NAME_CHARS and unicodedata.category(c) != "Cc")
    name = name.strip().lstrip(".").strip()
    stem, ext = os.path.splitext(name)
    if stem.upper() in WIN_RESERVED:
        stem = "_" + stem
    if len(stem) + len(ext) > MAX_NAME:
        stem = stem[:max(0, MAX_NAME - len(ext))].rstrip()
    return (stem + ext) or "file"


def unique_name(folder, name):
    """name, or 'stem (2).ext', 'stem (3).ext', ... whichever doesn't exist yet."""
    stem, ext = os.path.splitext(name)
    candidate, n = name, 1
    while os.path.lexists(os.path.join(folder, candidate)):
        n += 1
        suffix = " (%d)" % n
        candidate = stem[:max(1, MAX_NAME - len(ext) - len(suffix))] + suffix + ext
    return candidate


def make_item(slot, name, st):
    return {"name": name, "url": "/media/%s/%s" % (slot, quote(name, safe="")),
            "kind": EXT_KIND[ext_of(name)], "size": st.st_size, "mtime": st.st_mtime}


def list_media(media_dir):
    slots, keys = {}, []
    for slot in SLOTS:
        items = []
        try:
            with os.scandir(os.path.join(media_dir, slot)) as it:
                entries = list(it)
        except OSError:
            entries = []
        for entry in entries:
            if entry.name.startswith(".") or ext_of(entry.name) not in EXT_KIND:
                continue
            try:
                if entry.is_file():
                    items.append(make_item(slot, entry.name, entry.stat()))
            except OSError:
                continue  # vanished while we were looking
        items.sort(key=lambda item: (item["name"].casefold(), item["name"]))
        slots[slot] = items
        keys += [(slot, i["name"], i["size"], i["mtime"]) for i in items]
    rev = hashlib.sha1(json.dumps(sorted(keys)).encode("utf-8")).hexdigest()[:12]
    return {"rev": rev, "slots": slots}


def origin_matches(origin, host):
    """True if the Origin header's host:port equals the Host header's."""
    try:
        o, h = urlsplit(origin), urlsplit("//" + host)
        default = 443 if o.scheme == "https" else 80
        return bool(o.hostname) and (o.hostname, o.port or default) == (h.hostname, h.port or 80)
    except ValueError:
        return False


def parse_range(header, size):
    """(start, end) for a single byte range, None to ignore the header, 'bad' if unsatisfiable."""
    m = RANGE_RE.fullmatch(header)
    if not m or m.groups() == ("", ""):
        return None  # malformed or multi-range: just send the whole file
    first, last = m.groups()
    if not first:  # "bytes=-n": the last n bytes
        n = int(last)
        return (size - min(n, size), size - 1) if n and size else "bad"
    start = int(first)
    if last and int(last) < start:
        return None  # invalid range: ignore it
    if start >= size:
        return "bad"
    return start, min(int(last), size - 1) if last else size - 1


class MemazeServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != "nt"  # on Windows it would let two servers share a port

    def __init__(self, addr, media_dir, read_only=False, verbose=False):
        self.media_dir, self.read_only, self.verbose = media_dir, read_only, verbose
        self.upload_lock = threading.Lock()
        super().__init__(addr, Handler)

    def handle_error(self, request, client_address):
        if not isinstance(sys.exc_info()[1], QUIET_ERRORS):
            super().handle_error(request, client_address)


class Handler(BaseHTTPRequestHandler):
    server_version = "Memaze/1"
    protocol_version = "HTTP/1.1"
    timeout = 120
    segs, path, body_done, responded = None, "", False, False

    # ---- plumbing ----------------------------------------------------------
    def handle_one_request(self):
        self.segs, self.path, self.body_done, self.responded = None, "", False, False
        try:
            super().handle_one_request()
        except QUIET_ERRORS:
            self.close_connection = True

    def log_message(self, fmt, *args):
        if self.server.verbose:
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.responded = True
        super().end_headers()

    def route(self):
        raw = self.path
        if "://" in raw.split("?", 1)[0]:  # absolute-form request target
            raw = urlsplit(raw).path or "/"
        raw = raw.split("?", 1)[0].split("#", 1)[0]
        self.segs = [unquote(s, errors="replace") for s in raw.split("/") if s]
        return self.segs

    def run(self, handler):
        try:
            handler(self.route())
        except QUIET_ERRORS:
            self.close_connection = True
        except Exception as e:  # never leave the browser hanging
            self.log_error("error: %r", e)
            if self.responded:
                self.close_connection = True
            else:
                self.send_error(500, "%s: %s" % (type(e).__name__, e))

    def send_bytes(self, code, body, ctype, headers=()):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for key, value in headers:
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, obj, code=200, headers=()):
        self.send_bytes(code, json.dumps(obj).encode("utf-8"), "application/json", headers)

    def send_error(self, code, message=None, explain=None, headers=()):
        """JSON under /api, plain text elsewhere; always ends the connection."""
        message = message or HTTPStatus(code).phrase
        self.log_error("%d %s", code, message)
        self.discard_body()
        headers = [("Connection", "close")] + list(headers)
        if self.segs is None:
            self.route()
        if self.segs[:1] == ["api"]:
            self.send_json({"error": message}, code, headers)
        else:
            self.send_bytes(code, ("%d %s\n" % (code, message)).encode("utf-8"),
                            "text/plain" + UTF8, headers)

    def discard_body(self):
        """Read a small unread request body so the client actually sees our error reply."""
        if self.body_done or self.command not in ("POST", "PUT", "PATCH", "DELETE"):
            return
        self.body_done = True
        try:
            left = int(self.headers.get("Content-Length") or 0)
            while 0 < left <= 16 << 20:
                chunk = self.rfile.read(min(CHUNK, left))
                if not chunk:
                    break
                left -= len(chunk)
        except (ValueError, OSError, AttributeError):
            pass

    def reject(self, segs):
        """404 for unknown paths, 405 for known paths used with the wrong method."""
        if segs[:1] != ["api"]:
            return self.send_error(405)
        known = segs in (["api", "ping"], ["api", "media"]) or (
            segs[:2] == ["api", "media"] and len(segs) in (3, 4))
        self.send_error(405 if known else 404, None if known else "Unknown API endpoint")

    # ---- methods -----------------------------------------------------------
    def do_GET(self):
        self.run(self.get)

    do_HEAD = do_GET

    def do_POST(self):
        self.run(self.post)

    def do_DELETE(self):
        self.run(self.delete)

    def get(self, s):
        if s == ["api", "ping"]:
            media = self.server.media_dir
            return self.send_json({"ok": True, "app": "memaze", "version": 1,
                                   "writable": not self.server.read_only and os.access(media, os.W_OK),
                                   "slots": SLOTS, "mediaDir": media})
        if s == ["api", "media"]:
            return self.send_json(list_media(self.server.media_dir))
        if s[:1] == ["api"]:
            return self.reject(s)
        if s[:1] == ["media"]:
            if len(s) == 3 and s[1] in SLOTS and safe_segment(s[2]) and ext_of(s[2]) in EXT_KIND:
                return self.send_file(os.path.join(self.server.media_dir, s[1], s[2]))
            return self.send_error(404)
        self.send_file(self.static_path(s or ["index.html"]))

    def static_path(self, segs):
        if not all(safe_segment(seg) for seg in segs):
            return None
        root = os.path.realpath(APP_DIR)
        path = os.path.realpath(os.path.join(root, *segs))
        return path if path.startswith(root + os.sep) else None

    def send_file(self, path):
        try:
            if not path or not os.path.isfile(path):
                raise FileNotFoundError(path)
            f = open(path, "rb")
        except OSError:
            return self.send_error(404)
        with f:
            st = os.fstat(f.fileno())
            size, etag = st.st_size, '"%x-%x"' % (st.st_mtime_ns, st.st_size)
            headers = [("Accept-Ranges", "bytes"), ("ETag", etag),
                       ("Last-Modified", self.date_time_string(st.st_mtime))]
            rng = self.headers.get("Range")
            span = parse_range(rng, size) if rng else None
            if span == "bad":
                return self.send_error(416, headers=[("Content-Range", "bytes */%d" % size)])
            if span is None and etag in self.headers.get("If-None-Match", ""):
                self.send_response(304)
                for key, value in headers:
                    self.send_header(key, value)
                return self.end_headers()
            start, end = span or (0, size - 1)
            if span:
                headers.append(("Content-Range", "bytes %d-%d/%d" % (start, end, size)))
            ctype = MIME.get(os.path.splitext(path)[1].lower(), "application/octet-stream")
            self.send_response(206 if span else 200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(end - start + 1))
            for key, value in headers:
                self.send_header(key, value)
            self.end_headers()
            if self.command == "HEAD":
                return
            f.seek(start)
            left = end - start + 1
            while left > 0:
                chunk = f.read(min(CHUNK, left))
                if not chunk:  # file shrank under us
                    self.close_connection = True
                    break
                self.wfile.write(chunk)
                left -= len(chunk)

    def write_allowed(self):
        if self.server.read_only:
            self.send_error(403, "Server is read-only")
            return False
        origin = self.headers.get("Origin")
        if origin is not None and not origin_matches(origin, self.headers.get("Host", "")):
            self.send_error(403, "Cross-origin request refused")
            return False
        return True

    def post(self, s):
        if not self.write_allowed():
            return
        if len(s) != 3 or s[:2] != ["api", "media"]:
            return self.reject(s)
        slot = s[2]
        if slot not in SLOTS:
            return self.send_error(404, "Unknown slot: %s" % slot)
        if self.headers.get("Content-Length") is None:
            return self.send_error(411, "Content-Length required")
        try:
            length = int(self.headers["Content-Length"])
            if length < 0:
                raise ValueError
        except ValueError:
            return self.send_error(400, "Bad Content-Length")
        if length > MAX_UPLOAD:
            return self.send_error(413, "File too large (max 1 GiB)")
        raw = self.headers.get("X-Filename", "")
        try:  # tolerate clients that send raw UTF-8 instead of %-encoding
            raw = raw.encode("latin-1").decode("utf-8")
        except UnicodeError:
            pass
        name = sanitize_filename(unquote(raw, errors="replace"))
        if ext_of(name) not in EXT_KIND:
            return self.send_error(415, "Unsupported file type: %s" % name)

        folder = os.path.join(self.server.media_dir, slot)
        os.makedirs(folder, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=".upload-", suffix=".part", dir=folder)
        try:
            with os.fdopen(fd, "wb") as out:
                left = length
                while left > 0:
                    chunk = self.rfile.read(min(CHUNK, left))
                    if not chunk:
                        break
                    out.write(chunk)
                    left -= len(chunk)
            self.body_done = True
            if left:
                return self.send_error(400, "Upload incomplete")
            if os.name != "nt":
                os.chmod(tmp, 0o644)
            with self.server.upload_lock:
                name = unique_name(folder, name)
                os.replace(tmp, os.path.join(folder, name))
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
        item = make_item(slot, name, os.stat(os.path.join(folder, name)))
        self.send_json({"item": item}, 201, [("Location", item["url"])])

    def delete(self, s):
        if not self.write_allowed():
            return
        if len(s) != 4 or s[:2] != ["api", "media"]:
            return self.reject(s)
        slot, name = s[2], s[3]
        path = os.path.join(self.server.media_dir, slot, name)
        if slot not in SLOTS or not safe_segment(name) or ext_of(name) not in EXT_KIND \
                or not os.path.isfile(path):
            return self.send_error(404, "No such file")
        os.remove(path)
        self.send_json({"ok": True})


def lan_addresses():
    ips = []
    try:  # the address of the interface that would route outwards (no packet is sent)
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            ips.append(s.getsockname()[0])
    except OSError:
        pass
    try:
        ips += [info[4][0] for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)]
    except OSError:
        pass
    return [ip for i, ip in enumerate(ips)
            if ip not in ips[:i] and not ip.startswith(("127.", "0."))]


def url_for(host, port):
    return "http://%s:%d/" % ("[%s]" % host if ":" in host else host, port)


def main(argv=None):
    p = argparse.ArgumentParser(description="Memaze local game server.")
    p.add_argument("--port", type=int, default=8765, help="port to try first (default 8765)")
    p.add_argument("--host", default="127.0.0.1", help="0.0.0.0 = reachable on your network")
    p.add_argument("--media", default=os.path.join(APP_DIR, "media"), help="media folder")
    p.add_argument("--no-open", action="store_true", help="don't open a browser")
    p.add_argument("--read-only", action="store_true", help="refuse uploads and deletes")
    p.add_argument("--verbose", action="store_true", help="log every request")
    args = p.parse_args(argv)

    media = os.path.abspath(os.path.expanduser(args.media))
    try:
        for slot in SLOTS:
            os.makedirs(os.path.join(media, slot), exist_ok=True)
    except OSError as e:
        sys.exit("Memaze: cannot create media folder %s (%s)" % (media, e))

    server_cls = MemazeServer
    if ":" in args.host:
        server_cls = type("MemazeServer6", (MemazeServer,), {"address_family": socket.AF_INET6})
    server, error = None, None
    for port in range(args.port, min(args.port + 21, 65536)):
        try:
            server = server_cls((args.host, port), media, args.read_only, args.verbose)
            break
        except OSError as e:
            error = e
    if server is None:
        sys.exit("Memaze: could not listen on %s ports %d-%d (%s)"
                 % (args.host, args.port, args.port + 20, error))

    port = server.server_address[1]
    wildcard = args.host in ("0.0.0.0", "", "::")
    local_url = url_for("127.0.0.1" if wildcard else args.host, port)
    print("\n  Memaze is running%s." % (" (read-only)" if args.read_only else ""))
    if port != args.port:
        print("  (port %d was busy, using %d)" % (args.port, port))
    print("  Play here:       %s" % local_url)
    if wildcard:
        for ip in lan_addresses():
            print("  On your network: %s" % url_for(ip, port))
        if not args.read_only:
            print("  Warning: anyone on your network can upload and delete media files."
                  " Add --read-only to prevent that.")
    print("  Media folder:    %s" % media)
    print("  Press Ctrl+C to stop.\n", flush=True)

    if not args.no_open:
        timer = threading.Timer(0.3, lambda: webbrowser.open(local_url))
        timer.daemon = True
        timer.start()
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\n  Memaze stopped. Bye!")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
