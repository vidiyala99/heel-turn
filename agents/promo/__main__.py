"""Promo service. Run from repo root:  python3 -m agents.promo   (port HEEL_PROMO_PORT, default 8789)

POST /promo  {moment: "pre"|"mid"|"post", speaker, opponent, match_state} -> {lines: [{speaker, name, text, cites, facts}], meta}
GET  /health
CORS is open so the browser game can call it directly.
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from agents.promo.promo import Promos

PROMOS = Promos()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, obj) -> None:
        body = json.dumps(obj, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path.split("?")[0] == "/health":
            return self._send(200, {"ok": True, "writer": PROMOS.writer.mode, "memory": PROMOS.memory.source})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path.split("?")[0] != "/promo":
            return self._send(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            return self._send(200, PROMOS.promo(json.loads(self.rfile.read(n) or b"{}")))
        except (KeyError, ValueError) as e:
            return self._send(400, {"error": f"{type(e).__name__}: {e}"})

    def log_message(self, fmt, *args):
        pass


def main() -> None:
    port = int(os.environ.get("HEEL_PROMO_PORT", "8789"))
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"promo server on :{port} writer={PROMOS.writer.mode} memory={PROMOS.memory.source}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
