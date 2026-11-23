"""Planner: OpenAI when OPENAI_API_KEY is set, deterministic fallback otherwise or on any failure.

Every decision returns a plan row with exactly the docs/PLAN.md keys:
  {t_ms, wrestler, intent, target, reason, cites, room, vetoed_by?, approved_by?}
LLM output is validated (intent in the allowed set, target in the allowed set, cites a subset of the memory rows the agent
was shown); anything else falls back, so a cite in the log always names a real mart row.
"""
from __future__ import annotations

import json
import os
import time
import urllib.request

from . import memory as mem

WRESTLER_INTENTS = ("target", "counter", "ally", "betray", "pin", "toss", "taunt")
# Extension for the referee agent (same row keys, own intent values):
REF_INTENTS = ("count_fair", "count_fast", "count_slow", "bribe_accept", "bribe_decline")


def plan_row(t_ms, who, intent, target, reason, cites, room=None):
    return {"t_ms": t_ms, "wrestler": who, "intent": intent, "target": target, "reason": reason,
            "cites": list(cites), "room": room}


# --- deterministic brains ----------------------------------------------------------------
def fallback_wrestler(p: dict, state: dict, memory: mem.Memory, triangle: dict, allies: dict) -> dict:
    me = p["id"]
    t = state.get("t_ms", 0)
    tr = p["traits"]
    everyone = {w["id"]: w for w in state.get("wrestlers", []) + state.get("humans", [])}
    foes = [w for wid, w in everyone.items() if wid != me and not w.get("eliminated") and wid != allies.get(me)]
    humans = [h for h in state.get("humans", []) if not h.get("eliminated")]
    lb = [r for r in memory.tables["leaderboard"] if r["wrestler"] == me]
    lb_cite = [mem.cite("leaderboard", lb[0])] if lb else []

    # 1. finish a downed, tired foe
    down = [w for w in foes if w.get("down") and w.get("stamina", 1) < 0.35]
    if down:
        v = down[0]
        intent = "toss" if tr["aggression"] > 0.8 else "pin"
        return plan_row(t, me, intent, v["id"], f"{v['id']} is down at {v.get('stamina', 0):.0%} stamina", lb_cite)

    # 2. betray an ally I hold a grudge against (brain gates this through the commissioner)
    ally = allies.get(me)
    if ally:
        rel = memory.relation(me, ally)
        if rel and float(rel["trust"]) < p["betray_below_trust"] and float(rel["grudge"]) >= 0.5:
            why = f"trust {float(rel['trust']):.2f} < {p['betray_below_trust']}, grudge {float(rel['grudge']):.2f}"
            if rel.get("last_betrayal"):
                why += f" ({rel['last_betrayal']})"
            return plan_row(t, me, "betray", ally, why, [mem.cite("relationships", rel)])

    # 3. showboat when the crowd is cold
    if tr["showboat"] > 0.7 and state.get("crowd", {}).get(me, 0.5) < 0.5:
        return plan_row(t, me, "taunt", None, f"crowd at {state.get('crowd', {}).get(me, 0.5):.0%}; {p['lines']['taunt']}", lb_cite)

    # 4. counter a human's habit
    best = None
    for h in humans:
        rows = memory.habits_of(h["id"], h.get("situation", "opening"))
        if rows and (tr["read_habits"] >= 0.5 or float(rows[0]["share"]) >= 0.6):
            if best is None or float(rows[0]["share"]) > float(best[1]["share"]):
                best = (h, rows[0])
    if best:
        h, r = best
        beat = next(k for k, v in triangle.items() if v == r["move"])
        return plan_row(t, me, "counter", h["id"],
                        f"{h['id']} picks {r['move']} {float(r['share']):.0%} of the time when {r['situation']} -> {beat}",
                        [mem.cite("habits", r)])

    # 5. hit whoever I hold the biggest grudge against, else the weakest
    if foes:
        def grudge(w):
            rel = memory.relation(me, w["id"])
            return float(rel["grudge"]) if rel else 0.0
        v = max(foes, key=lambda w: (grudge(w), -w.get("stamina", 1)))
        rel = memory.relation(me, v["id"])
        cites = [mem.cite("relationships", rel)] if rel and grudge(v) > 0 else lb_cite
        why = f"grudge {grudge(v):.2f}" if grudge(v) > 0 else f"weakest at {v.get('stamina', 1):.0%} stamina"
        return plan_row(t, me, "target", v["id"], why, cites)
    return plan_row(t, me, "taunt", None, "nobody left to hit", lb_cite)


def ref_bribe_score(p: dict, memory: mem.Memory) -> tuple[float, list[str], str]:
    rows = memory.ref_ledger(p["id"])
    caught = sum(1 for r in rows if r["caught"]) / len(rows) if rows else 0.0
    score = p["traits"]["greed"] - p["traits"]["reputation_weight"] * caught
    why = f"greed {p['traits']['greed']:.2f} - rep_weight {p['traits']['reputation_weight']:.2f} x caught {caught:.2f} = {score:+.2f}"
    return score, [mem.cite("ref_ledger", r) for r in rows], why


def fallback_ref(p: dict, state: dict, memory: mem.Memory, bribes: dict) -> dict:
    """Per-tick count call. bribes: approved {briber: True}."""
    t = state.get("t_ms", 0)
    pin = state.get("pin")  # {"by": id, "on": id}
    if pin and bribes:
        _, cites, _ = ref_bribe_score(p, memory)
        if pin["by"] in bribes:
            return plan_row(t, p["id"], "count_fast", pin["on"], f"paid by {pin['by']}; {p['lines']['accept']}", cites)
        if pin["on"] in bribes:
            return plan_row(t, p["id"], "count_slow", pin["by"], f"paid by {pin['on']}; {p['lines']['accept']}", cites)
    return plan_row(t, p["id"], "count_fair", pin["on"] if pin else None, "calling it straight", [])


def fallback_alliance_reply(p: dict, offerer: str, memory: mem.Memory, t_ms: int) -> dict:
    rel = memory.relation(p["id"], offerer)
    trust = float(rel["trust"]) if rel else 0.5
    cites = [mem.cite("relationships", rel)] if rel else []
    if trust >= p["ally_above_trust"]:
        return plan_row(t_ms, p["id"], "ally", offerer, f"trust {trust:.2f} >= {p['ally_above_trust']}; {p['lines']['ally']}", cites)
    why = f"trust {trust:.2f} < {p['ally_above_trust']}"
    if rel and rel.get("last_betrayal"):
        why += f"; remembers {rel['last_betrayal']}"
    return plan_row(t_ms, p["id"], "target", offerer, why, cites)


# --- OpenAI planner ------------------------------------------------------------------------
class Planner:
    def __init__(self):
        self.key = os.environ.get("OPENAI_API_KEY")
        self.model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")  # lowest measured p50, see docs/lanes/band.md
        self.timeout = float(os.environ.get("HEEL_LLM_TIMEOUT_S", "2.5"))
        self.base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
        # reasoning models are slow per call; default to the lowest effort for gpt-5* (override/clear with env)
        default_effort = "minimal" if self.model.startswith("gpt-5") else ""
        self.reasoning = os.environ.get("HEEL_LLM_REASONING", default_effort)

    @property
    def mode(self) -> str:
        return "openai" if self.key else "fallback"

    def decide(self, persona: dict, task: str, state: dict, snapshot: dict, intents, targets, fallback: dict):
        """Returns (plan_row, meta). meta = {who, source, ms, error?}."""
        t0 = time.perf_counter()
        meta = {"who": persona["id"], "task": task, "source": "fallback"}
        if self.key:
            try:
                plan = self._ask(persona, task, state, snapshot, intents, targets, fallback)
                meta["source"] = "openai"
                fallback = plan
            except Exception as e:
                meta["error"] = f"{type(e).__name__}: {str(e)[:120]}"
        meta["ms"] = round((time.perf_counter() - t0) * 1000, 1)
        return fallback, meta

    def _ask(self, persona, task, state, snapshot, intents, targets, fallback) -> dict:
        allowed_cites = {r["cite"] for r in snapshot["rows"]}
        sys = (f"You are {persona['name']}, a pro wrestler/official in the original game HEEL TURN. Gimmick: {persona['gimmick']}. "
               f"Voice: {persona['voice']}. Traits: {json.dumps(persona.get('traits', {}))}. "
               "Decide your next plan from your memory rows. Reply with JSON only: "
               '{"intent": str, "target": str|null, "reason": str (<= 20 words, in character), "cites": [cite ids]}. '
               f"intent must be one of {list(intents)}; target one of {list(targets)} or null; cites must be cite ids from memory.")
        user = json.dumps({"task": task, "state": state, "memory": snapshot["rows"], "default_plan": fallback})
        req_body = {"model": self.model, "response_format": {"type": "json_object"},
                    "messages": [{"role": "system", "content": sys}, {"role": "user", "content": user}]}
        if self.reasoning:
            req_body["reasoning_effort"] = self.reasoning
        body = json.dumps(req_body).encode()
        req = urllib.request.Request(f"{self.base}/chat/completions", data=body, method="POST",
                                     headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            out = json.loads(json.loads(r.read())["choices"][0]["message"]["content"])
        if out.get("intent") not in intents:
            raise ValueError(f"bad intent {out.get('intent')!r}")
        if out.get("target") is not None and out["target"] not in targets:
            raise ValueError(f"bad target {out.get('target')!r}")
        cites = [c for c in out.get("cites") or [] if c in allowed_cites]
        if not cites and fallback["cites"]:
            cites = fallback["cites"]
        return plan_row(fallback["t_ms"], persona["id"], out["intent"], out.get("target"), str(out.get("reason", ""))[:200], cites,
                        fallback.get("room"))
