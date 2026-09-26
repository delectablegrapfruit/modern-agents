#!/usr/bin/env python3
"""Download real Binance spot klines and write data/market-data.js.

Source: Binance's public market-data archive (https://data.binance.vision), the
same monthly kline CSVs Binance publishes for backtesting. No API key needed.

    python3 scripts/fetch_data.py            # rebuild everything
    python3 scripts/fetch_data.py --only luna # rebuild one dataset

Each scenario in js/scenarios.js names a dataset key defined here.
"""
import argparse, csv, io, json, os, sys, zipfile, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

HOSTS = [
    "https://data.binance.vision",
    "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision",
]

# key: (symbol, interval, first day, last day)  — ranges include the lookback shown before the first decision.
SCENARIO_DATA = {
    "btc_etf":     ("BTCUSDT",  "1d", "2023-08-01", "2024-03-20"),
    "sol_revival": ("SOLUSDT",  "1d", "2023-08-01", "2023-12-31"),
    "btc_top":     ("BTCUSDT",  "1d", "2021-07-15", "2022-01-25"),
    "eth_merge":   ("ETHUSDT",  "1d", "2022-05-15", "2022-10-10"),
    "doge_snl":    ("DOGEUSDT", "1d", "2021-02-01", "2021-05-31"),
    "pepe":        ("PEPEUSDT", "4h", "2023-05-05", "2023-06-12"),
    "covid":       ("BTCUSDT",  "1d", "2019-12-01", "2020-05-15"),
    "yen":         ("BTCUSDT",  "1h", "2024-07-30", "2024-08-09"),
    "oct10":       ("SOLUSDT",  "4h", "2025-09-22", "2025-10-20"),
    "luna":        ("LUNAUSDT", "1h", "2022-05-03", "2022-05-13"),
    "ftx":         ("SOLUSDT",  "4h", "2022-10-24", "2022-11-16"),
    "celsius":     ("BTCUSDT",  "1d", "2022-04-01", "2022-07-15"),
}

# Practice mode draws random windows from full daily histories.
PRACTICE = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "LTCUSDT"]
PRACTICE_RANGE = ("2019-01-01", "2026-08-31")

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "market-data.js")
CACHE = os.path.join(HERE, "..", ".cache")


def months(first, last):
    y, m = int(first[:4]), int(first[5:7])
    ly, lm = int(last[:4]), int(last[5:7])
    while (y, m) <= (ly, lm):
        yield f"{y:04d}-{m:02d}"
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def fetch_month(symbol, interval, ym):
    name = f"{symbol}-{interval}-{ym}.zip"
    cached = os.path.join(CACHE, name)
    if os.path.exists(cached):
        with open(cached, "rb") as f:
            blob = f.read()
    else:
        blob = None
        for host in HOSTS:
            url = f"{host}/data/spot/monthly/klines/{symbol}/{interval}/{name}"
            try:
                with urllib.request.urlopen(url, timeout=30) as r:
                    blob = r.read()
                break
            except Exception:
                continue
        if blob is None:
            return []  # month not listed (before listing / after delisting)
        os.makedirs(CACHE, exist_ok=True)
        with open(cached, "wb") as f:
            f.write(blob)
    rows = []
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        for member in z.namelist():
            for rec in csv.reader(io.TextIOWrapper(z.open(member))):
                if not rec or not rec[0].isdigit():
                    continue
                t = int(rec[0])
                if t > 10**14:  # Binance switched to microseconds in 2025
                    t //= 1000
                rows.append([t // 1000, float(rec[1]), float(rec[2]), float(rec[3]), float(rec[4]), float(rec[7])])
    return rows


def sig(x, n=6):
    return float(f"{x:.{n}g}")


def load(symbol, interval, first, last):
    lo = int(datetime.fromisoformat(first).replace(tzinfo=timezone.utc).timestamp())
    hi = int(datetime.fromisoformat(last).replace(tzinfo=timezone.utc).timestamp()) + 86400
    with ThreadPoolExecutor(8) as ex:
        parts = list(ex.map(lambda ym: fetch_month(symbol, interval, ym), months(first, last)))
    rows = sorted({r[0]: r for p in parts for r in p}.values())
    rows = [r for r in rows if lo <= r[0] < hi]
    if not rows:
        raise SystemExit(f"no data for {symbol} {interval} {first}..{last}")
    return {
        "symbol": symbol, "interval": interval,
        "t": [r[0] for r in rows],
        "o": [sig(r[1]) for r in rows], "h": [sig(r[2]) for r in rows],
        "l": [sig(r[3]) for r in rows], "c": [sig(r[4]) for r in rows],
        "v": [round(r[5]) for r in rows],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    args = ap.parse_args()
    data = {"source": "Binance spot klines via data.binance.vision",
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "scenarios": {}, "practice": {}}
    for key, spec in SCENARIO_DATA.items():
        if args.only and key != args.only:
            continue
        d = load(*spec)
        data["scenarios"][key] = d
        print(f"{key:12s} {spec[0]:9s} {spec[1]} {len(d['t']):4d} candles", file=sys.stderr)
    if not args.only:
        for sym in PRACTICE:
            d = load(sym, "1d", *PRACTICE_RANGE)
            data["practice"][sym] = d
            print(f"practice     {sym:9s} 1d {len(d['t']):4d} candles", file=sys.stderr)
    elif os.path.exists(OUT):  # merge into the existing file
        with open(OUT) as f:
            old = json.loads(f.read().split("=", 1)[1].rstrip().rstrip(";"))
        old["scenarios"].update(data["scenarios"])
        data = old
    with open(OUT, "w") as f:
        f.write("// Generated by scripts/fetch_data.py — real Binance spot klines. Do not edit by hand.\n")
        f.write("window.MARKET_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")
    print(f"wrote {os.path.relpath(OUT)} ({os.path.getsize(OUT) // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
