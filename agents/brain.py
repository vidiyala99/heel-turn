"""Director: runs the 5 BAND agents (4 wrestlers + referee Lou Varga) for one match.

The game calls Director.plan(state) every ~4 s and on entry/knockdown; it returns one plan row per AI agent.
BAND signals produced (all through transport.py, so they are real in live mode):
  1. private locker rooms per side + mention-scoped delivery          (create_room / send with mentions)
  2. a battle-royal entrant added to rooms at runtime                  (lookup_peers + add_participant)
  3. alliance offer answered by its target from the target's memory   (offer -> target inbox -> reply)
  4. betrayal / bribe proposals the human commissioner approves/blocks (pending until a verdict message)
No outcome is scripted: a bribe or betrayal exists only when an agent's LLM plan chooses it, and Lou decides every call
(bribe, count, rope break, cheat) by LLM. Code only enforces the gates: the commissioner rules on every proposal and Lou
may act corruptly only behind an approved bribe. Each scheme row's reason starts with its decision tag ([LLM] or the
planner's fallback label).
"""
from __future__ import annotations

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import memory as mem
from . import planner as pl
from .transport import make_pool, make_transport, parse_verdict

CAST = json.loads((Path(__file__).parent / "personalities.json").read_text())
WRESTLERS = {w["id"]: w for w in CAST["wrestlers"]}
REF = CAST["referee"]
COMM = CAST["commissioner"]["id"]
# Who stays in each pooled room between matches; everyone else is removed so the next match's adds are real.
BASELINE = {"ring": {REF["id"], COMM}, "heel locker room": {"silas"}, "face locker room": {"kane"},
            "commissioner desk": {"silas", COMM}, "back room": {"silas"}}
TRIANGLE = {k: v for k, v in CAST["fight_triangle"].items() if not k.startswith("_")}


def tag(reason: str, meta: dict) -> str:
    """Prefix a scheme decision with who made it: the LLM, or the planner's labeled fallback."""
    return f"[LLM] {reason}" if meta.get("source") == "openai" else (
        reason if reason.startswith(pl.FALLBACK_TAG) else f"{pl.FALLBACK_TAG} {reason}")


class Director:
    def __init__(self, transport=None, memory=None, planner=None):
        cast = {**{w: "agent" for w in WRESTLERS}, REF["id"]: "agent", COMM: "human"}
        self.band = transport or make_transport(cast)
        self.pool = make_pool(self.band)
        self.memory = memory or mem.Memory()
        self.planner = planner or pl.Planner()
        self.lock = threading.RLock()
        self.log: list[dict] = []
        self.meta: list[dict] = []
        self.match = None

    # --- match setup -------------------------------------------------------------------------
    def _start(self, state: dict) -> None:
        match = state.get("match", "m?")
        self.memory.refresh()  # read marts before the match
        self.in_ring: list[str] = []
        self.alliances: dict[str, str] = {}
        self.proposals: dict[str, dict] = {}
        self.bribes: dict[str, bool] = {}
        self.bribe_offered: set[str] = set()  # one envelope per wrestler per match
        self.last_intent: dict[str, str] = {}
        b, pool = self.band, self.pool
        pool.reset(BASELINE)
        self.rooms = {
            "ring": pool.get("ring", REF["id"]),
            "heel": pool.get("heel locker room", "silas"),
            "face": pool.get("face locker room", "kane"),
            "desk": pool.get("commissioner desk", "silas"),
        }
        b.add_participant(self.rooms["ring"], REF["id"], COMM)
        b.add_participant(self.rooms["desk"], "silas", COMM)
        self.match = match  # only once the rooms exist, so a refused room retries setup on the next tick
        for w in state.get("wrestlers", []):
            if w["id"] in WRESTLERS:
                self._enter(w["id"], t_ms=state.get("t_ms", 0), runtime=False)

    def _say(self, room: str, sender: str, text: str, mentions: list[str]):
        """Every message carries the match tag: rooms are shared across matches, the tag keeps them apart."""
        return self.band.send(room, sender, f"[{self.match}] {text}", mentions)

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
        self._say(self.rooms["ring"], REF["id"], f"{'NEW ENTRANT' if runtime else 'In the ring'}: {WRESTLERS[wid]['name']}!",
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
            room = self.pool.get(f"silas x {wid}", "silas")
            self.band.add_participant(room, "silas", wid)
            self._alliance("silas", wid, room, t_ms)

    # --- signal 3: alliance offer answered by its target -----------------------------------
    def _alliance(self, offerer: str, target: str, room: str, t_ms: int) -> dict:
        b = self.band
        offer = self._say(room, offerer, f"ALLIANCE? {WRESTLERS[offerer]['lines']['ally']}", [target])
        # dependent handoff: the target answers only what actually reached its inbox
        received = [m for m in b.inbox(target, room) if m.id == offer.id] if b.mode == "mock" else [offer]
        assert received, f"{target} never received the offer"
        p = WRESTLERS[target]
        fb = pl.fallback_alliance_reply(p, offerer, self.memory, t_ms)
        snap = self.memory.snapshot_for(target, [offerer])
        reply, meta = self.planner.decide(p, f"{offerer} offers an alliance: {offer.text!r}. Accept (ally) or refuse (target)?",
                                          {"t_ms": t_ms}, snap, ("ally", "target"), (offerer,), fb)
        reply["room"] = room
        self._say(room, target, ("ACCEPT. " if reply["intent"] == "ally" else "REFUSE. ") + reply["reason"], [offerer])
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
        msg = self._say(room, proposer, f"PROPOSAL {pid}: {text} Reply 'approve {pid}' or 'block {pid}'.", [COMM])
        # since: the desk room outlives the match, so only verdicts posted after this proposal count
        self.proposals[pid] = {"id": pid, "kind": kind, "plan": plan, "proposer": proposer, "status": "pending", "room": room,
                               "since": msg.t}
        self._record(dict(plan), {"who": proposer, "task": f"propose {pid}", "source": "proposal", "ms": 0})
        return self.proposals[pid]

    def verdict(self, pid: str, decision: str) -> dict:
        """Mock/UI path: the commissioner types the verdict into the desk room (live: they type it in the Band app)."""
        with self.lock:
            p = self.proposals[pid]
            self._say(p["room"], COMM, f"{decision} {pid}", [p["proposer"]])
            self._poll_verdicts()
            return p

    def _poll_verdicts(self) -> None:
        for pid, p in self.proposals.items():
            if p["status"] != "pending":
                continue
            for m in self.band.verdicts(p["room"], COMM, p["proposer"]):
                v = parse_verdict(m.text)
                if v and pid in m.text and m.t >= p.get("since", 0):
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

    # --- bribe: a wrestler's LLM plan offers, Lou's LLM weighs it, the commissioner rules -----
    def _bribe(self, offer: dict, offer_meta: dict, t_ms: int) -> None:
        briber = offer["wrestler"]
        self.bribe_offered.add(briber)
        b = self.band
        room = self.pool.get("back room", "silas")
        if briber != "silas":
            b.add_participant(room, "silas", briber)
        b.add_participant(room, "silas", REF["id"])
        offer = {**offer, "target": REF["id"], "room": room, "reason": tag(offer["reason"], offer_meta)}
        self._record(offer, offer_meta)
        self._say(room, briber, f"Envelope's under the turnbuckle. {offer['reason']}", [REF["id"]])
        task = (f"{WRESTLERS[briber]['name']} slips you an envelope in the back room: {offer['reason']!r}. "
                "bribe_accept or bribe_decline. You call it straight by default. Weigh your motives: the cash, your "
                "reputation (ref_ledger rows: how often you were caught), and any grudge or soft spot for this wrestler. "
                "If you accept, the commissioner still has to let it stand.")
        row, meta = self._ref_decide(task, {"t_ms": t_ms, "briber": briber, "your_motives": self._lou_motives()},
                                     ("bribe_accept", "bribe_decline"), (briber,),
                                     ("bribe_decline", briber, "an envelope is not worth my name"))
        row["room"] = room
        line = REF["lines"]["accept" if row["intent"] == "bribe_accept" else "decline"]
        self._say(room, REF["id"], f"{line} {row['reason']}", [briber])
        if row["intent"] == "bribe_accept":  # the proposal records the row; commissioner decides if it stands
            self._propose("bribe", row, briber,
                          f"Lou Varga accepted {briber}'s envelope to look the other way. {row['reason']}")
        else:
            self._record(row, meta)

    def _lou_motives(self) -> dict:
        return {"caught_rate": pl.ref_caught_rate(self.memory, REF["id"]), "greed": REF["traits"]["greed"],
                "reputation_weight": REF["traits"]["reputation_weight"],
                "approved_bribes_tonight": sorted(self.bribes)}

    def _ref_decide(self, task: str, state: dict, intents, targets, honest: tuple):
        """Lou decides by LLM; on no answer the labeled fallback is the honest call."""
        fb = pl.fallback_ref(REF, state.get("t_ms", 0), *honest)
        snap = self.memory.snapshot_for(REF["id"], [])
        row, meta = self.planner.decide(REF, task, state, snap, intents, targets, fb)
        row["reason"] = tag(row["reason"], meta)
        return row, meta

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

            active = [w["id"] for w in state.get("wrestlers", [])
                      if w["id"] in self.in_ring and not w.get("eliminated")]
            jobs = {wid: self._wrestler_job(wid, state) for wid in active}
            jobs[REF["id"]] = self._ref_job(state)
            with ThreadPoolExecutor(max_workers=len(jobs)) as ex:
                futs = {wid: ex.submit(fn) for wid, fn in jobs.items()}
                results = {wid: f.result() for wid, f in futs.items()}

            plans, metas = [], []
            for wid, (row, meta) in results.items():
                row = self._gate(wid, row, meta, state)
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
        # This match's live habit counts from the game (humans[].habits = {situation: {move: n}}): the LLM reads them
        # next to the Bruin marts, cited as live:<player>/<situation>/<move>.
        live = []
        for h in state.get("humans", []):
            for sit, moves in (h.get("habits") or {}).items():
                total = sum(max(0, int(n)) for n in moves.values()) or 1
                for mv, n in moves.items():
                    if int(n) > 0:
                        live.append({"cite": f"live:{h['id']}/{sit}/{mv}", "player": h["id"], "situation": sit,
                                     "move": mv, "n": int(n), "share": round(int(n) / total, 2), "now": sit == h.get("situation")})
        ledger = [{"cite": mem.cite("ref_ledger", r), **r} for r in self.memory.ref_ledger(REF["id"])]
        snap = {**snap, "rows": live + snap["rows"] + ledger}
        targets = tuple(foes) + (() if wid in self.bribe_offered else (REF["id"],))
        allies = dict(self.alliances)
        if any(pr["proposer"] == wid and pr["kind"] == "betray" for pr in self.proposals.values()):
            allies.pop(wid, None)  # one betrayal proposal per match; don't re-propose

        view = {**state, "you": self._standing(wid, state, allies)}

        def run():
            fb = pl.fallback_wrestler(p, state, self.memory, TRIANGLE, allies)
            task = ("plan your next 4 seconds. Fight triangle: block beats strike, strike beats grapple, grapple beats block. "
                    "Rows marked now=true are the human's habits in their current situation. To counter, use intent counter, "
                    "target the human, and put the habit row you are countering FIRST in cites. Reason: what you expect and "
                    "your answer, e.g. 'you strike 78% on opening -> I block, then grapple'. "
                    "You may also scheme; nobody makes you. intent bribe (target lou): slip referee Lou Varga an envelope "
                    "so he looks away; his ref_ledger rows show how often he gets caught, and the commissioner can block it. "
                    "intent betray (target your ally in you.ally): turn on your partner; the commissioner can block it. "
                    "Scheme when your character would: low trust or high grudge toward a partner, losing the match "
                    "(you.standing), a schemer gimmick. A loyal or honest wrestler who is winning usually just fights. "
                    "Use target lou only with intent bribe.")
            return self.planner.decide(p, task, view, snap, pl.WRESTLER_INTENTS, targets, fb)
        return run

    def _standing(self, wid: str, state: dict, allies: dict) -> dict:
        """The motive facts the LLM weighs: how the match is going for me, my partner, what's already on the desk."""
        alive = [w for w in state.get("wrestlers", []) + state.get("humans", []) if not w.get("eliminated")]
        me = next((w for w in alive if w["id"] == wid), {})
        mine = float(me.get("stamina", 1))
        rank = 1 + sum(1 for w in alive if float(w.get("stamina", 1)) > mine)
        ally = allies.get(wid)
        rel = self.memory.relation(wid, ally) if ally else None
        return {"id": wid, "stamina": mine, "rank": f"{rank} of {len(alive)}",
                "standing": "losing" if rank > (len(alive) + 1) / 2 else "winning",
                "ally": ally, "trust_in_ally": rel and float(rel["trust"]), "grudge_on_ally": rel and float(rel["grudge"]),
                "envelope_already_offered": wid in self.bribe_offered,
                "lou_approved_bribes": sorted(self.bribes)}

    def _ref_job(self, state: dict):
        """Lou decides by LLM whenever a call is near him: a pin count, a rope break, a cheat in view.
        A corrupt option is only on the menu when an approved bribe from the wrestler it helps backs it."""
        bribes, t = dict(self.bribes), state.get("t_ms", 0)
        everyone = tuple(self.in_ring) + tuple(h["id"] for h in state.get("humans", []))
        pin, rope, cheat = state.get("pin"), state.get("rope_break"), state.get("cheat")
        if pin:  # {"by", "on"}: a fast count helps the pinner, a slow count helps the pinned
            intents = ("count_fair",) + (("count_fast",) if pin["by"] in bribes else ()) + \
                      (("count_slow",) if pin["on"] in bribes else ())
            task = (f"{pin['by']} is pinning {pin['on']}. Call the count: count_fair, or (only if offered, "
                    "because you took that wrestler's approved envelope) count_fast / count_slow.")
            honest = ("count_fair", pin["on"], "calling it straight")
        elif rope:  # {"by": the one holding the pin/hold, "on": the one reaching the ropes}
            intents = ("rope_call",) + (("rope_miss",) if rope["by"] in bribes else ())
            task = (f"{rope['on']} reaches the ropes while {rope['by']} works on them. rope_call (break it up) "
                    "or, only if offered, rope_miss.")
            honest = ("rope_call", rope["on"], "ropes, break it up")
        elif cheat:  # {"by", "on", "what"}
            intents = ("cheat_call",) + (("cheat_miss",) if cheat["by"] in bribes else ())
            task = (f"You see {cheat['by']} cheat on {cheat['on']} ({cheat.get('what', 'a low blow')}). "
                    "cheat_call or, only if offered, cheat_miss.")
            honest = ("cheat_call", cheat["by"], "I saw that")
        else:  # nothing to call: no decision, no LLM call
            idle = pl.plan_row(t, REF["id"], "count_fair", None, "[idle] nothing to call", [])
            return lambda: (idle, {"who": REF["id"], "task": "watch", "source": "idle", "ms": 0.0})
        task += (" You call it straight by default. Your motives: reputation (times caught in ref_ledger), the cash "
                 "you were paid tonight, grudges.")
        view = {**state, "your_motives": self._lou_motives()}
        return lambda: self._ref_decide(task, view, intents, everyone, honest)

    def _gate(self, wid: str, row: dict, meta: dict, state: dict) -> dict:
        """Schemes never execute without the commissioner. Approved betrayals replace the plan once."""
        for p in self.proposals.values():
            if p["proposer"] == wid and p["kind"] == "betray" and p.get("execute"):
                p["execute"] = False
                out = dict(p["plan"])
                out["t_ms"] = self._t
                out["approved_by"] = COMM
                return out
        if row["intent"] == "bribe":
            if wid not in self.bribe_offered:
                self._bribe(row, meta, self._t)
            alt = pl.fallback_wrestler(WRESTLERS[wid], state, self.memory, TRIANGLE, self.alliances)
            alt["reason"] = f"(envelope offered) {alt['reason']}"
            return alt
        if row["target"] == REF["id"]:  # Lou is only a target for an envelope
            return pl.fallback_wrestler(WRESTLERS[wid], state, self.memory, TRIANGLE, self.alliances)
        if row["intent"] == "betray":
            row = {**row, "reason": tag(row["reason"], meta)}
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
            self._say(room, wid, f"plan: {row['intent']} {row['target'] or ''} - {row['reason']}", mates)

    def _record(self, row: dict, meta: dict) -> None:
        self.log.append({k: v for k, v in row.items() if not k.startswith("_")})
        self.meta.append(meta)
