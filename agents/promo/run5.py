"""Five promos end to end over HTTP against a running promo server, with wall-clock latency per call.

python3 -m agents.promo.run5 [base_url]     (no url: serves agents.promo's handler in-process on a free port)
"""
from __future__ import annotations

import json
import statistics
import sys
import time
import urllib.request

CASES = [
    {"moment": "pre", "speaker": "mae", "opponent": "silas", "match_state": {"match": "m13"}},
    {"moment": "pre", "speaker": "vex", "opponent": "kane", "match_state": {"match": "m13", "players": {"kane": "p1"}}},
    {"moment": "mid", "speaker": "kane", "opponent": "vex",
     "match_state": {"event": "near_fall", "players": {"vex": "p1"}}},
    {"moment": "post", "speaker": "silas", "opponent": "vex", "match_state": {"winner": "silas", "finish": "pin"}},
    {"moment": "post", "speaker": "mae", "opponent": "silas", "match_state": {"winner": "mae", "finish": "toss"}},
]


def main() -> None:
    if len(sys.argv) > 1:
        base = sys.argv[1]
    else:  # serve the real handler in-process on a free port
        import threading
        from http.server import ThreadingHTTPServer

        from agents.promo.__main__ import PROMOS, Handler

        srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{srv.server_address[1]}"
        print(f"in-process promo server {base} writer={PROMOS.writer.mode} memory={PROMOS.memory.source}")
    wall = []
    for c in CASES:
        t0 = time.perf_counter()
        req = urllib.request.Request(f"{base}/promo", data=json.dumps(c).encode(), method="POST",
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as r:
            out = json.loads(r.read())
        ms = (time.perf_counter() - t0) * 1000
        wall.append(ms)
        m = out["meta"]
        print(f"\n[{c['moment']}] {c['speaker']} vs {c['opponent']}  source={m['source']} model={m.get('model')} "
              f"server_ms={m['ms']} wall_ms={ms:.0f}" + (f" error={m['error']}" if m.get("error") else ""))
        for l in out["lines"]:
            print(f"  {l['name']}: {l['text']}  cites={l['cites']}")
    print(f"\nwall ms: min {min(wall):.0f}  median {statistics.median(wall):.0f}  max {max(wall):.0f}  (n={len(wall)})")


if __name__ == "__main__":
    main()
