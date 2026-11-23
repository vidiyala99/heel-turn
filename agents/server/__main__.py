"""HTTP service the game calls. Run from repo root:  python3 -m agents.server   (port HEEL_AGENTS_PORT, default 8787)

POST /plan     body = match state JSON  -> {plans, meta, latency_ms, band, planner, memory, pending}
GET  /log      -> {rows: [plan rows]}     (?since=N returns rows[N:])
POST /verdict  body = {"id": "betray-1", "decision": "approve"|"block"}   (commissioner button; live: also typed in Band)
GET  /console  -> {lines: [BAND calls]}   GET /inbox?viewer=vex -> what that participant received (mock only)
GET  /health   -> {ok, band, planner, memory, band_rooms: "n/250", band_reason}   (band_reason: short text for the chip)
CORS is open so the browser game can call it directly.
"""
from __future__ import annotations

import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from agents.brain import Director
from agents.transport import ROOM_LIMIT, BandRoomLimit

DIRECTOR = Director()
BAND_STATE = {"reason": None, "rooms": None, "at": 0.0}


def band_rooms() -> str:
    """Rooms counted against BAND's cap, cached for a minute (live mode pages every agent's room list)."""
    if time.time() - BAND_STATE["at"] > 60:
        try:
            BAND_STATE["rooms"] = DIRECTOR.band.room_usage()
        except Exception as e:
            BAND_STATE["rooms"] = f"? ({type(e).__name__})"
        BAND_STATE["at"] = time.time()
    return f"{BAND_STATE['rooms']}/{ROOM_LIMIT}"


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

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/health":
            return self._send(200, {"ok": True, "band": DIRECTOR.band.mode, "planner": DIRECTOR.planner.mode,
                                    "memory": DIRECTOR.memory.source, "band_rooms": band_rooms(),
                                    "band_reason": BAND_STATE["reason"]})
        if u.path == "/log":
            since = int(q.get("since", ["0"])[0])
            return self._send(200, {"rows": DIRECTOR.log[since:], "next": len(DIRECTOR.log)})
        if u.path == "/console":
            return self._send(200, {"lines": DIRECTOR.band.console})
        if u.path == "/inbox":
            viewer = q.get("viewer", [""])[0]
            try:
                msgs = DIRECTOR.band.inbox(viewer)
            except NotImplementedError as e:
                return self._send(501, {"error": str(e)})
            return self._send(200, {"viewer": viewer, "messages": [m.__dict__ for m in msgs]})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        try:
            body = self._body()
            if u.path == "/plan":
                res = DIRECTOR.plan(body)
                BAND_STATE["reason"] = None
                return self._send(200, res)
            if u.path == "/verdict":
                return self._send(200, DIRECTOR.verdict(body["id"], body["decision"]))
        except BandRoomLimit as e:
            BAND_STATE.update(reason=e.reason, at=0.0)
            return self._send(503, {"error": str(e), "reason": e.reason})
        except KeyError as e:
            return self._send(400, {"error": f"missing {e}"})
        except Exception as e:
            return self._send(500, {"error": f"{type(e).__name__}: {e}"})
        self._send(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        pass


def main() -> None:
    port = int(os.environ.get("HEEL_AGENTS_PORT", "8787"))
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"agents server on :{port} band={DIRECTOR.band.mode} planner={DIRECTOR.planner.mode} memory={DIRECTOR.memory.source}",
          flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
