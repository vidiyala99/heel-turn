"""Fan-points odds + polls service (PLAY MONEY ONLY). Run from repo root:  python3 -m agents.odds
Port HEEL_ODDS_PORT (default 8790). Data dir HEEL_ODDS_DIR (default bruin/data). CORS open.

GET  /odds?match=m5                    -> {match, priced_from, board: [{wrestler, name, win_prob, line, decimal_odds}], settled}
POST /bet   {fan, pick, stake, match, market?="winner"|poll id}  -> the bet + new balance (400 {error} if refused)
GET  /polls?match=m5                   -> [{id, question, choices, votes, share, prior, decimal_odds, status, outcome}]
POST /vote  {poll, choice, match, fan?}  -> the poll
GET  /fan?fan=fan_ana                  -> {balance, bets: [... status, payout]}
POST /event {match, kind, actor, target, ...} or [events]  -> {settled: [{match, market, outcome}]}
POST /refresh                          -> re-read the Bruin marts (call after bash bruin/run.sh)
GET  /health
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from agents.odds.book import Book, BetError

BOOK: Book | None = None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code: int, obj) -> None:
        body = json.dumps(obj, default=sorted).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, {})

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def _route(self, method: str):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        b = self._body() if method == "POST" else {}
        match = (b.get("match") if isinstance(b, dict) else None) or q.get("match") or "next"
        if (method, u.path) == ("GET", "/health"):
            return {"ok": True, "currency": "fan points (play money)"}
        if (method, u.path) == ("GET", "/odds"):
            return BOOK.odds(match)
        if (method, u.path) == ("GET", "/polls"):
            return BOOK.polls_for(match)
        if (method, u.path) == ("GET", "/fan"):
            return BOOK.fan(q.get("fan", ""))
        if (method, u.path) == ("POST", "/bet"):
            return BOOK.bet(b.get("fan"), b.get("pick"), b.get("stake"), match, b.get("market") or "winner")
        if (method, u.path) == ("POST", "/vote"):
            return BOOK.vote(match, b.get("poll"), b.get("choice"), b.get("fan"))
        if (method, u.path) == ("POST", "/event"):
            settled = []
            for e in b if isinstance(b, list) else [b]:
                settled += BOOK.event(e)
            return {"settled": settled}
        if (method, u.path) == ("POST", "/refresh"):
            BOOK.refresh()
            return {"ok": True}
        raise LookupError(u.path)

    def _handle(self, method: str):
        try:
            self._send(200, self._route(method))
        except BetError as e:
            self._send(400, {"error": str(e)})
        except LookupError as e:
            self._send(404, {"error": f"no route {e}"})
        except Exception as e:  # noqa: BLE001 - a bad request must not kill the service
            self._send(500, {"error": f"{type(e).__name__}: {e}"})

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")


def serve(port: int | None = None, book: Book | None = None) -> ThreadingHTTPServer:
    global BOOK
    BOOK = book or Book()
    return ThreadingHTTPServer(("127.0.0.1", port or int(os.environ.get("HEEL_ODDS_PORT", "8790"))), Handler)


if __name__ == "__main__":
    srv = serve()
    print(f"fan-points odds service on http://127.0.0.1:{srv.server_port} (play money only)")
    srv.serve_forever()
