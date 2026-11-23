"""Director: runs the 5 BAND agents (4 wrestlers + referee Lou Varga) for one match.

The game calls Director.plan(state) every ~4 s and on entry/knockdown; it returns one plan row per AI agent.
BAND signals produced (all through transport.py, so they are real in live mode):
  1. private locker rooms per side + mention-scoped delivery          (create_room / send with mentions)
  2. a battle-royal entrant added to rooms at runtime                  (lookup_peers + add_participant)
  3. alliance offer answered by its target from the target's memory   (offer -> target inbox -> reply)
  4. betrayal / bribe proposals the human commissioner approves/blocks (pending until a verdict message)
"""
from __future__ import annotations

import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import memory as mem
from . import planner as pl
from .transport import make_transport, parse_verdict

CAST = json.loads((Path(__file__).parent / "personalities.json").read_text())
WRESTLERS = {w["id"]: w for w in CAST["wrestlers"]}
REF = CAST["referee"]
COMM = CAST["commissioner"]["id"]
TRIANGLE = {k: v for k, v in CAST["fight_triangle"].items() if not k.startswith("_")}


class Director:
    def __init__(self, transport=None, memory=None, planner=None):
        cast = {**{w: "agent" for w in WRESTLERS}, REF["id"]: "agent", COMM: "human"}
        self.band = transport or make_transport(cast)
        self.memory = memory or mem.Memory()
        self.planner = planner or pl.Planner()
        self.bribe_at_ms = int(os.environ.get("HEEL_BRIBE_AT_MS", "15000"))
        self.lock = threading.RLock()
        self.log: list[dict] = []
        self.meta: list[dict] = []
        self.match = None

    # --- match setup -------------------------------------------------------------------------
    def _start(self, state: dict) -> None:
        self.match = state.get("match", "m?")
        self.memory.refresh()  # read marts before the match
        self.in_ring: list[str] = []
        self.alliances: dict[str, str] = {}
        self.proposals: dict[str, dict] = {}
        self.bribes: dict[str, bool] = {}
        self.bribe_offered = False
        self.last_intent: dict[str, str] = {}
        b = self.band
        self.rooms = {
            "ring": b.create_room(REF["id"], f"{self.match} ring"),
            "heel": b.create_room("silas", f"{self.match} heel locker room"),
            "face": b.create_room("kane", f"{self.match} face locker room"),
            "desk": b.create_room("silas", f"{self.match} commissioner desk"),
        }
        b.add_participant(self.rooms["ring"], REF["id"], COMM)
        b.add_participant(self.rooms["desk"], "silas", COMM)
        for w in state.get("wrestlers", []):
            if w["id"] in WRESTLERS:
                self._enter(w["id"], t_ms=state.get("t_ms", 0), runtime=False)

    def _side_room(self, wid: str) -> str:
        return self.rooms[WRESTLERS[wid]["side"]]

    def _enter(self, wid: str, t_ms: int, runtime: bool) -> None:
        b = self.band
        side = WRESTLERS[wid]["side"]
        owner = "silas" if side == "heel" else "kane"
        if runtime:  # discover the new agent on BAND, then pull it into the rooms mid-match
            peers = b.lookup_peers(REF["id"])
            assert any(p["id"] == wid for p in peers), f"{wid} not found via band_lookup_peers"
            if owner != wid:
                b.lookup_peers(owner)
        b.add_participant(self.rooms["ring"], REF["id"], wid)
        if owner != wid:
            b.add_participant(self._side_room(wid), owner, wid)
        self.in_ring.append(wid)
        b.send(self.rooms["ring"], REF["id"], f"{'NEW ENTRANT' if runtime else 'In the ring'}: {WRESTLERS[wid]['name']}!",
               [wid, COMM])
        if runtime:
            self._offers_to_newcomer(wid, t_ms)
        elif {"silas", "vex"} <= set(self.in_ring) and "silas" not in self.alliances:
            self._alliance("silas", "vex", self.rooms["heel"], t_ms)

    def _offers_to_newcomer(self, wid: str, t_ms: int) -> None:
        side = WRESTLERS[wid]["side"]
        mates = [w for w in self.in_ring if w != wid and WRESTLERS[w]["side"] == side]
        for m in mates:
            if m not in self.alliances and wid not in self.alliances:
                self._alliance(m, wid, self._side_room(wid), t_ms)
        # the schemer always tries to poach a newcomer in a fresh private room
        if WRESTLERS[wid]["side"] != "heel" and "silas" in self.in_ring:
            room = self.band.create_room("silas", f"{self.match} silas x {wid}")
            self.band.add_participant(room, "silas", wid)
            self._alliance("silas", wid, room, t_ms)

    # --- signal 3: alliance offer answered by its target -----------------------------------
    def _alliance(self, offerer: str, target: str, room: str, t_ms: int) -> dict:
        b = self.band
        offer = b.send(room, offerer, f"ALLIANCE? {WRESTLERS[offerer]['lines']['ally']}", [target])
        # dependent handoff: the target answers only what actually reached its inbox
        received = [m for m in b.inbox(target, room) if m.id == offer.id] if b.mode == "mock" else [offer]
        assert received, f"{target} never received the offer"
        p = WRESTLERS[target]
        fb = pl.fallback_alliance_reply(p, offerer, self.memory, t_ms)
        snap = self.memory.snapshot_for(target, [offerer])
        reply, meta = self.planner.decide(p, f"{offerer} offers an alliance: {offer.text!r}. Accept (ally) or refuse (target)?",
                                          {"t_ms": t_ms}, snap, ("ally", "target"), (offerer,), fb)
        reply["room"] = room
        b.send(room, target, ("ACCEPT. " if reply["intent"] == "ally" else "REFUSE. ") + reply["reason"], [offerer])
        if reply["intent"] == "ally":
            self.alliances[offerer] = target
            self.alliances[target] = offerer
        self._record(reply, meta)
        return reply

    # --- signal 4: proposals the commissioner approves or blocks ---------------------------
    def _propose(self, kind: str, plan: dict, proposer: str, text: str) -> dict:
        pid = f"{kind}-{len(self.proposals) + 1}"
        room = self.rooms["desk"]
        plan ={k: v for k, v in plan.items() if not k.startswith("_")}
        plan["room"] = room
        self.band.send(room, proposer, f"PROPOSAL {pid}: {text} Reply 'approve {pid}' or 'block {pid}'.", [COMM])
        self.proposals[pid] = {"id": pid, "kind": kind, "plan": plan, "proposer": proposer, "status": "pending", "room": room}
        self._record(dict(plan), {"who": proposer, "task": f"propose {pid}", "source": "proposal", "ms": 0})
        return self.proposals[pid]

    def verdict(self, pid: str, decision: str) -> dict:
        """Mock/UI path: the commissioner types the verdict into the desk room (live: they type it in the Band app)."""
        with self.lock:
            p = self.proposals[pid]
            self.band.send(p["room"], COMM, f"{decision} {pid}", [p["proposer"]])
            self._poll_verdicts()
            return p

    def _poll_verdicts(self) -> None:
        for pid, p in self.proposals.items():
            if p["status"] != "pending":
                continue
            for m in self.band.verdicts(p["room"], COMM, p["proposer"]):
                v = parse_verdict(m.text)
                if v and pid in m.text:
                    p["status"] = "approved" if v == "approve" else "blocked"
                    row = dict(p["plan"])
                    row["approved_by" if v == "approve" else "vetoed_by"] = COMM
                    row["t_ms"] = self._t
                    self._record(row, {"who": p["proposer"], "task": f"verdict {pid}", "source": "commissioner", "ms": 0})
                    self._on_verdict(p)
                    break

    def _on_verdict(self, p: dict) -> None:
        plan = p["plan"]
        if p["kind"] == "betray" and p["status"] == "approved":
            self.alliances.pop(plan["target"], None)
            self.alliances.pop(plan["wrestler"], None)
            p["execute"] = True
        if p["kind"] == "bribe" and p["status"] == "approved":
            self.bribes[plan["target"]] = True

    # --- bribe: schemer -> ref in a back room, ref weighs reputation, commissioner rules ------
    def _bribe(self, briber: str, t_ms: int) -> None:
        self.bribe_offered = True
        b = self.band
        room = b.create_room(briber, f"{self.match} back room")
        b.add_participant(room, briber, REF["id"])
        b.send(room, briber, "Envelope's under the turnbuckle. Count fast for me tonight.", [REF["id"]])
        score, cites, why = pl.ref_bribe_score(REF, self.memory)
        fb = pl.plan_row(t_ms, REF["id"], "bribe_accept" if score > 0 else "bribe_decline", briber, why, cites, room)
        snap = self.memory.snapshot_for(REF["id"], [])
        row, meta = self.planner.decide(REF, f"{briber} offers you a bribe to fast-count. Accept or decline, weighing your reputation.",
                                        {"t_ms": t_ms}, snap, ("bribe_accept", "bribe_decline"), (briber,), fb)
        row["room"] = room
        line = REF["lines"]["accept" if row["intent"] == "bribe_accept" else "decline"]
        b.send(room, REF["id"], f"{line} ({row['reason']})", [briber])
        if row["intent"] == "bribe_accept":  # the proposal records the row; commissioner decides if it stands
            self._propose("bribe", row, briber,
                          f"Lou Varga accepted {briber}'s envelope to fast-count. {row['reason']}")
        else:
            self._record(row, meta)

    # --- the per-tick entry point --------------------------------------------------------------
    def plan(self, state: dict) -> dict:
        with self.lock:
            t0 = time.perf_counter()
            self._t = state.get("t_ms", 0)
            if state.get("match", "m?") != self.match:
                self._start(state)
            for w in state.get("wrestlers", []):
                if w["id"] in WRESTLERS and w["id"] not in self.in_ring and not w.get("eliminated"):
                    self._enter(w["id"], self._t, runtime=True)
            self._poll_verdicts()
            if not self.bribe_offered and self._t >= self.bribe_at_ms and "silas" in self.in_ring:
                self._bribe("silas", self._t)

            active = [w["id"] for w in state.get("wrestlers", [])
                      if w["id"] in self.in_ring and not w.get("eliminated")]
            jobs = {wid: self._wrestler_job(wid, state) for wid in active}
            jobs[REF["id"]] = self._ref_job(state)
            with ThreadPoolExecutor(max_workers=len(jobs)) as ex:
                futs = {wid: ex.submit(fn) for wid, fn in jobs.items()}
                results = {wid: f.result() for wid, f in futs.items()}

            plans, metas = [], []
            for wid, (row, meta) in results.items():
                row = self._gate(wid, row, state)
                if wid in WRESTLERS:
                    row["room"] = row.get("room") or self._side_room(wid)
                    self._chatter(wid, row)
                else:
                    row["room"] = row.get("room") or self.rooms["ring"]
                self._record(row, meta)
                plans.append(row)
                metas.append(meta)
            total = round((time.perf_counter() - t0) * 1000, 1)
            return {"plans": plans, "meta": metas, "latency_ms": total, "band": self.band.mode,
                    "planner": self.planner.mode, "memory": self.memory.source,
                    "pending": [p for p in self.proposals.values() if p["status"] == "pending"]}

    def _wrestler_job(self, wid: str, state: dict):
        p = WRESTLERS[wid]
        foes = [h["id"] for h in state.get("humans", [])] + [w for w in self.in_ring if w != wid]
        snap = self.memory.snapshot_for(wid, foes)
        targets = tuple(foes)
        allies = dict(self.alliances)
        if any(pr["proposer"] == wid and pr["kind"] == "betray" for pr in self.proposals.values()):
            allies.pop(wid, None)  # one betrayal proposal per match; don't re-propose

        def run():
            fb = pl.fallback_wrestler(p, state, self.memory, TRIANGLE, allies)
            return self.planner.decide(p, "plan your next 4 seconds", state, snap, pl.WRESTLER_INTENTS, targets, fb)
        return run

    def _ref_job(self, state: dict):
        snap = self.memory.snapshot_for(REF["id"], [])
        bribes = dict(self.bribes)

        def run():
            fb = pl.fallback_ref(REF, state, self.memory, bribes)
            # a crooked count is only on the menu when an approved bribe backs it (the commissioner's block holds)
            allowed = ("count_fair",) if fb["intent"] == "count_fair" else ("count_fair", fb["intent"])
            return self.planner.decide(REF, "call the count", state, snap, allowed,
                                       tuple(self.in_ring) + tuple(h["id"] for h in state.get("humans", [])), fb)
        return run

    def _gate(self, wid: str, row: dict, state: dict) -> dict:
        """Betrayals never execute without the commissioner. Approved ones replace the plan once."""
        for p in self.proposals.values():
            if p["proposer"] == wid and p["kind"] == "betray" and p.get("execute"):
                p["execute"] = False
                out = dict(p["plan"])
                out["t_ms"] = self._t
                out["approved_by"] = COMM
                return out
        if row["intent"] == "betray":
            self._propose("betray", row, wid, f"{WRESTLERS[wid]['name']} wants to turn on {row['target']}: {row['reason']}")
            alt = pl.fallback_wrestler(WRESTLERS[wid], state, self.memory, TRIANGLE, {})
            alt["reason"] = f"(betrayal pending commissioner) {alt['reason']}"
            return alt
        return row

    def _chatter(self, wid: str, row: dict) -> None:
        """Post the plan to the side's locker room when it changes (only teammates are mentioned)."""
        if self.last_intent.get(wid) == (row["intent"], row["target"]):
            return
        self.last_intent[wid] = (row["intent"], row["target"])
        room = self._side_room(wid)
        mates = [m for m in self.band.participants(room) if m != wid and m in WRESTLERS]
        if mates:
            self.band.send(room, wid, f"plan: {row['intent']} {row['target'] or ''} - {row['reason']}", mates)

    def _record(self, row: dict, meta: dict) -> None:
        self.log.append({k: v for k, v in row.items() if not k.startswith("_")})
        self.meta.append(meta)
