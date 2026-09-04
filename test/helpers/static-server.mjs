/* Tiny static file server for browser tests: serves a directory over http://127.0.0.1:<port>
 * with correct MIME types, HEAD and HTTP Range support (Chromium's media stack seeks with
 * Range requests) so <video> fixtures load same-origin (canvas stays untainted) and seek fast.
 *
 *   const srv = await startStaticServer(rootDir, { routes: { '/harness.html': '<!doctype html>...' } });
 *   await page.goto(srv.url + '/harness.html');
 *   await srv.close();
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

export async function startStaticServer(rootDir, { routes = {}, host = '127.0.0.1', port = 0, log = null } = {}) {
  const root = resolve(rootDir);
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const send = (status, headers, body) => {
      res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
      res.end(body);
    };
    if (log) log(`${req.method} ${req.url} ${req.headers.range || ''}`);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, {}, 'method not allowed');

    const route = routes[pathname];
    if (route !== undefined) {
      const body = typeof route === 'function' ? route(req) : route;
      const type = typeof body === 'string' && body.trimStart().startsWith('<') ? MIME['.html'] : 'text/plain; charset=utf-8';
      return send(200, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) }, req.method === 'HEAD' ? '' : body);
    }

    const file = normalize(join(root, pathname));
    if (file !== root && !file.startsWith(root + sep)) return send(403, {}, 'forbidden');
    let st;
    try {
      st = statSync(file);
    } catch {
      return send(404, {}, 'not found');
    }
    if (!st.isFile()) return send(404, {}, 'not found');

    const headers = {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    };
    let start = 0;
    let end = st.size - 1;
    let status = 200;
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m || (m[1] === '' && m[2] === '')) return send(416, { 'Content-Range': `bytes */${st.size}` }, '');
      if (m[1] === '') {
        start = Math.max(0, st.size - Number(m[2]));
      } else {
        start = Number(m[1]);
        if (m[2] !== '') end = Math.min(end, Number(m[2]));
      }
      if (start > end || start >= st.size) return send(416, { 'Content-Range': `bytes */${st.size}` }, '');
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    createReadStream(file, { start, end }).pipe(res);
  });
  await new Promise((r) => server.listen(port, host, r));
  const url = `http://${host}:${server.address().port}`;
  return {
    url,
    server,
    close: () =>
      new Promise((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      }),
  };
}
