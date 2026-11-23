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


def offline_director(planner=None):
    p = planner or pl.Planner()
    if planner is None:
        p.key = None
    cast = {**{w: "agent" for w in WRESTLERS}, REF["id"]: "agent", COMM: "human"}
    return Director(transport=MockBand(cast), memory=mem.Memory(db_path=""), planner=p)


class FakeLLM(pl.Planner):
    """Stands in for OpenAI: `choose(persona_id, intents, targets, fallback)` returns (intent, target) or None (= fall back).
    Validates like the real planner, so a choice outside the offered menu fails the same way."""

    def __init__(self, choose):
        super().__init__()
        self.key = "fake"
        self.choose = choose

    def _ask(self, persona, task, state, snapshot, intents, targets, fallback):
        pick = self.choose(persona["id"], intents, targets, fallback)
        if pick is None:
            raise TimeoutError("fake timeout")
        intent, target = pick
        if intent not in intents or (target is not None and target not in targets):
            raise ValueError(f"bad pick {pick}")
        return pl.plan_row(fallback["t_ms"], persona["id"], intent, target, f"{persona['id']} chose {intent}",
                           fallback["cites"], fallback.get("room"))


def schemer(persona, intents, targets, fb):
    """Silas bribes and turns on Vex; Lou takes envelopes and cheats whenever the menu offers it."""
    if persona == "silas" and "lou" in targets:
        return "bribe", "lou"
    if persona == "silas" and "vex" in targets:
        return "betray", "vex"
    if persona == "lou":
        for corrupt in ("bribe_accept", "count_fast", "count_slow", "rope_miss", "cheat_miss"):
            if corrupt in intents:
                return corrupt, fb["target"] if corrupt != "bribe_accept" else targets[0]
    return fb["intent"], fb["target"]


def st(t, ws, **kw):
    return {"match": "m1", "t_ms": t, "wrestlers": [{"id": w, "stamina": 0.8} for w in ws],
            "humans": [{"id": "p1", "situation": "opening"}], **kw}


SCHEME_INTENTS = {"bribe", "betray", "bribe_accept", "count_fast", "count_slow", "rope_miss", "cheat_miss"}


class TestBrain(unittest.TestCase):
    def test_rows_have_exact_plan_keys_and_real_cites(self):
        d = offline_director(FakeLLM(schemer))
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

    def test_no_scheme_without_an_llm_decision(self):
        """Every code path, offline: no LLM means no bribe, no betrayal, no crooked call, ever."""
        d = offline_director()
        for t in range(0, 60000, 4000):
            pin = {"by": "silas", "on": "kane"} if t % 8000 == 0 else None
            d.plan(st(t, ["vex", "kane", "silas", "mae"], pin=pin, rope_break={"by": "silas", "on": "kane"},
                      cheat={"by": "silas", "on": "kane"}))
        self.assertEqual([r for r in d.log if r["intent"] in SCHEME_INTENTS], [])
        self.assertEqual(d.proposals, {})
        lou = [r for r in d.log if r["wrestler"] == "lou" and not r["reason"].startswith("[idle]")]
        self.assertTrue(lou)
        self.assertTrue(all(r["reason"].startswith(pl.FALLBACK_TAG) for r in lou), lou)

    def test_every_scheme_row_names_its_llm_decision(self):
        d = offline_director(FakeLLM(schemer))
        d.plan(st(0, ["vex", "kane", "silas"]))
        d.plan(st(4000, ["vex", "kane", "silas"]))
        for pid in list(d.proposals):
            d.verdict(pid, "approve")
        d.plan(st(8000, ["vex", "kane", "silas"], pin={"by": "silas", "on": "kane"}))
        schemes = [r for r in d.log if r["intent"] in SCHEME_INTENTS]
        self.assertEqual({r["intent"] for r in schemes} >= {"bribe", "bribe_accept", "betray", "count_fast"}, True, schemes)
        for r in schemes:
            self.assertTrue(r["reason"].startswith("[LLM] "), r)

    def test_ref_timeout_falls_back_to_honest_and_labeled(self):
        d = offline_director(FakeLLM(lambda who, i, t, fb: None if who == "lou" else schemer(who, i, t, fb)))
        d.plan(st(0, ["vex", "kane", "silas"]))
        offer = next(r for r in d.log if r["intent"] == "bribe")
        self.assertTrue(offer["reason"].startswith("[LLM] "))
        lou = next(r for r in d.log if r["wrestler"] == "lou" and r["intent"].startswith("bribe"))
        self.assertEqual(lou["intent"], "bribe_decline")
        self.assertTrue(lou["reason"].startswith(pl.FALLBACK_TAG))
        self.assertFalse([p for p in d.proposals.values() if p["kind"] == "bribe"])

    def test_one_envelope_per_wrestler_per_match(self):
        d = offline_director(FakeLLM(schemer))
        for t in (0, 4000, 8000):
            d.plan(st(t, ["vex", "kane", "silas"]))
        self.assertEqual(len([r for r in d.log if r["intent"] == "bribe"]), 1)

    def test_betrayal_waits_for_commissioner_and_block_stops_it(self):
        d = offline_director(FakeLLM(schemer))
        d.plan(st(0, ["vex", "kane", "silas"]))  # tick 1: the envelope
        out = d.plan(st(4000, ["vex", "kane", "silas"]))  # tick 2: the turn is proposed, not executed
        pid = next(p for p in d.proposals if p.startswith("betray"))
        self.assertNotEqual(next(r for r in out["plans"] if r["wrestler"] == "silas")["intent"], "betray")
        d.verdict(pid, "block")
        out = d.plan(st(8000, ["vex", "kane", "silas"]))
        self.assertNotEqual(next(r for r in out["plans"] if r["wrestler"] == "silas")["intent"], "betray")
        self.assertTrue(any(r.get("vetoed_by") == COMM for r in d.log))
        self.assertEqual(d.alliances.get("silas"), "vex")

    def test_approved_bribe_lets_llm_ref_fast_count(self):
        d = offline_director(FakeLLM(schemer))
        out = d.plan(st(0, ["vex", "kane", "silas"]))
        pid = next(p["id"] for p in out["pending"] if p["kind"] == "bribe")
        d.verdict(pid, "approve")
        out = d.plan(st(4000, ["vex", "kane", "silas"], pin={"by": "silas", "on": "kane"}))
        self.assertEqual(next(r for r in out["plans"] if r["wrestler"] == "lou")["intent"], "count_fast")
        out = d.plan(st(8000, ["vex", "kane", "silas"], rope_break={"by": "silas", "on": "kane"}))
        self.assertEqual(next(r for r in out["plans"] if r["wrestler"] == "lou")["intent"], "rope_miss")

    def test_llm_ref_cannot_cheat_without_approved_bribe(self):
        d = offline_director(FakeLLM(schemer))
        out = d.plan(st(0, ["vex", "kane", "silas"]))
        pid = next(p["id"] for p in out["pending"] if p["kind"] == "bribe")
        d.verdict(pid, "block")
        for k, call, fair in (("pin", {"by": "silas", "on": "kane"}, "count_fair"),
                              ("rope_break", {"by": "silas", "on": "kane"}, "rope_call"),
                              ("cheat", {"by": "silas", "on": "kane"}, "cheat_call")):
            out = d.plan(st(4000, ["vex", "kane", "silas"], **{k: call}))
            self.assertEqual(next(r for r in out["plans"] if r["wrestler"] == "lou")["intent"], fair, k)

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
        d.plan(s(16000, ["vex", "kane", "silas", "mae"]))

    def test_no_room_created_after_warm_up_across_20_matches(self):
        d = offline_director(FakeLLM(schemer))
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
        d = offline_director(FakeLLM(schemer))
        d.plan(st(0, ["vex", "kane", "silas"]))
        d.plan(st(16000, ["vex", "kane", "silas"]))
        first = sorted(d.proposals)
        self.assertTrue(first, "the scheming LLM should produce at least one proposal")
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

        srv.DIRECTOR = offline_director(FakeLLM(schemer))
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
