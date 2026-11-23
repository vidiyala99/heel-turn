"""Run from repo root:  python3 -m unittest discover -s agents/tests -t .   (offline: planner forced to fallback)"""
from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path

from agents import memory as mem
from agents import planner as pl
from agents.brain import COMM, REF, WRESTLERS, Director
from agents.transport import MockBand, parse_verdict

PLAN_KEYS = {"t_ms", "wrestler", "intent", "target", "reason", "cites", "room"}
OPTIONAL = {"approved_by", "vetoed_by"}


def offline_director():
    p = pl.Planner()
    p.key = None
    cast = {**{w: "agent" for w in WRESTLERS}, REF["id"]: "agent", COMM: "human"}
    return Director(transport=MockBand(cast), memory=mem.Memory(db_path=""), planner=p)


def st(t, ws, **kw):
    return {"match": "m1", "t_ms": t, "wrestlers": [{"id": w, "stamina": 0.8} for w in ws],
            "humans": [{"id": "p1", "situation": "opening"}], **kw}


class TestBrain(unittest.TestCase):
    def test_rows_have_exact_plan_keys_and_real_cites(self):
        d = offline_director()
        d.plan(st(0, ["vex", "kane", "silas"]))
        d.plan(st(5000, ["vex", "kane", "silas", "mae"]))
        valid = set()
        for m in mem.MARTS:
            valid |= {mem.cite(m, r) for r in d.memory.tables[m]}
        for r in d.log:
            self.assertTrue(PLAN_KEYS <= set(r) <= PLAN_KEYS | OPTIONAL, r)
            self.assertTrue(set(r["cites"]) <= valid, r["cites"])

    def test_locker_room_is_private(self):
        d = offline_director()
        d.plan(st(0, ["vex", "kane", "silas"]))
        self.assertTrue(d.band.inbox("vex", d.rooms["heel"]))
        self.assertEqual(d.band.inbox("kane", d.rooms["heel"]), [])
        with self.assertRaises(PermissionError):
            d.band.send(d.rooms["heel"], "kane", "let me in", ["vex"])

    def test_runtime_entrant_and_reply_from_target_memory(self):
        d = offline_director()
        d.plan(st(0, ["vex", "kane", "silas"]))
        self.assertNotIn("mae", d.band.participants(d.rooms["ring"]))
        d.plan(st(5000, ["vex", "kane", "silas", "mae"]))
        self.assertIn("mae", d.band.participants(d.rooms["ring"]))
        refuse = [r for r in d.log if r["wrestler"] == "mae" and r["target"] == "silas" and r["intent"] == "target"]
        self.assertEqual(refuse[0]["cites"], ["relationships.mae>silas"])
        self.assertEqual(d.alliances.get("mae"), "kane")

    def test_betrayal_waits_for_commissioner_and_block_stops_it(self):
        d = offline_director()
        d.plan(st(0, ["vex", "kane", "silas"]))
        pid = next(p for p in d.proposals if p.startswith("betray"))
        out = d.plan(st(4000, ["vex", "kane", "silas"]))
        self.assertNotEqual(next(r for r in out["plans"] if r["wrestler"] == "silas")["intent"], "betray")
        d.verdict(pid, "block")
        out = d.plan(st(8000, ["vex", "kane", "silas"]))
        self.assertNotEqual(next(r for r in out["plans"] if r["wrestler"] == "silas")["intent"], "betray")
        self.assertTrue(any(r.get("vetoed_by") == COMM for r in d.log))
        self.assertEqual(d.alliances.get("silas"), "vex")

    def test_approved_bribe_makes_ref_fast_count(self):
        d = offline_director()
        d.plan(st(0, ["vex", "kane", "silas"]))
        out = d.plan(st(20000, ["vex", "kane", "silas"]))
        pid = next(p["id"] for p in out["pending"] if p["kind"] == "bribe")
        d.verdict(pid, "approve")
        out = d.plan(st(24000, ["vex", "kane", "silas"], pin={"by": "silas", "on": "kane"}))
        self.assertEqual(next(r for r in out["plans"] if r["wrestler"] == "lou")["intent"], "count_fast")

    def test_llm_ref_cannot_cheat_without_approved_bribe(self):
        class CrookedLLM(pl.Planner):
            def _ask(self, persona, task, state, snapshot, intents, targets, fallback):
                if persona["id"] == "lou" and "count_slow" in intents:
                    return {**fallback, "intent": "count_slow"}
                if fallback["intent"] not in intents:
                    raise ValueError("bad intent")
                return fallback
        d = offline_director()
        d.planner = CrookedLLM()
        d.planner.key = "fake"
        d.plan(st(0, ["vex", "kane", "silas"]))
        out = d.plan(st(20000, ["vex", "kane", "silas"]))
        pid = next(p["id"] for p in out["pending"] if p["kind"] == "bribe")
        d.verdict(pid, "block")
        out = d.plan(st(24000, ["vex", "kane", "silas"], pin={"by": "silas", "on": "kane"}))
        self.assertEqual(next(r for r in out["plans"] if r["wrestler"] == "lou")["intent"], "count_fair")

    def test_parse_verdict(self):
        self.assertEqual(parse_verdict("@silas approve betray-1"), "approve")
        self.assertEqual(parse_verdict("BLOCK it"), "block")
        self.assertIsNone(parse_verdict("hmm"))


class TestRoomPool(unittest.TestCase):
    """BAND caps an account at 250 rooms: matches must reuse rooms, not create them."""

    def play(self, d, match):
        def s(t, ws):
            return {**st(t, ws), "match": match}
        d.plan(s(0, ["vex", "kane", "silas"]))
        d.plan(s(8000, ["vex", "kane", "silas", "mae"]))  # runtime entrant + silas poach room
        d.plan(s(16000, ["vex", "kane", "silas", "mae"]))  # bribe in the back room

    def test_no_room_created_after_warm_up_across_20_matches(self):
        d = offline_director()
        self.play(d, "m0")
        warm = d.band.room_usage()
        for i in range(1, 21):
            before = len(d.band.console)
            self.play(d, f"m{i}")
            lines = d.band.console[before:]
            self.assertFalse([x for x in lines if x.startswith("band_create_chatroom")], f"match m{i} created a room")
            # the runtime entrant is still a real add into the ring, every match
            self.assertTrue([x for x in lines if "band_add_participant" in x and "add=mae" in x and "ring" in x])
        self.assertEqual(d.band.room_usage(), warm)
        self.assertLessEqual(warm, 6)

    def test_old_match_verdict_does_not_carry_over(self):
        d = offline_director()
        d.plan(st(0, ["vex", "kane", "silas"]))
        d.plan(st(16000, ["vex", "kane", "silas"]))
        first = sorted(d.proposals)
        self.assertTrue(first, "the offline ledger should produce at least one proposal")
        for pid in first:
            d.verdict(pid, "approve")
        d.plan({**st(0, ["vex", "kane", "silas"]), "match": "m2"})
        d.plan({**st(16000, ["vex", "kane", "silas"]), "match": "m2"})
        # same ids again in m2, same desk room: m1's "approve <id>" messages must not decide them
        again = [p for pid, p in d.proposals.items() if pid in first]
        self.assertTrue(again)
        for p in again:
            self.assertEqual(p["status"], "pending", p["id"])


class TestMemory(unittest.TestCase):
    def test_duckdb_reader(self):
        try:
            import duckdb
        except ImportError:
            self.skipTest("duckdb not installed")
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "bruin.duckdb")
            con = duckdb.connect(path)
            con.execute("create schema marts")
            con.execute("create table marts.relationships(a text, b text, trust double, grudge double, last_betrayal text)")
            con.execute("insert into marts.relationships values ('silas','vex',0.1,0.9,'m99')")
            con.close()
            m = mem.Memory(db_path=path)
            self.assertTrue(m.source.startswith("duckdb:"))
            self.assertEqual(m.relation("silas", "vex")["last_betrayal"], "m99")
            self.assertEqual(m.tables["habits"], [])


class TestServer(unittest.TestCase):
    def test_plan_log_verdict_over_http(self):
        from http.server import ThreadingHTTPServer
        import agents.server.__main__ as srv

        srv.DIRECTOR = offline_director()
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), srv.Handler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{httpd.server_address[1]}"

        def post(path, obj):
            req = urllib.request.Request(base + path, data=json.dumps(obj).encode(), method="POST",
                                         headers={"Content-Type": "application/json"})
            return json.loads(urllib.request.urlopen(req).read())
        try:
            out = post("/plan", st(0, ["vex", "kane", "silas"]))
            self.assertEqual({r["wrestler"] for r in out["plans"]}, {"vex", "kane", "silas", "lou"})
            pid = out["pending"][0]["id"]
            self.assertEqual(post("/verdict", {"id": pid, "decision": "approve"})["status"], "approved")
            rows = json.loads(urllib.request.urlopen(base + "/log").read())["rows"]
            self.assertTrue(any(r.get("approved_by") == COMM for r in rows))
        finally:
            httpd.shutdown()


if __name__ == "__main__":
    unittest.main()
