"""How often do the agents scheme when nothing forces them?  python3 -m agents.tools.scheme_rate [matches] [ticks]

Plays N matches on mock BAND with the real planner (OPENAI_API_KEY): 3 AIs start, Mae enters at 8 s, one human; stamina
drifts by a seeded walk so standings differ per match; a pin every 3rd tick. The commissioner approves every proposal so
approved schemes play out. Prints per-match counts, the rates, and example reasons; writes the raw rows as JSON.
"""
from __future__ import annotations

import json
import os
import random
import sys
from pathlib import Path

os.environ.setdefault("HEEL_BAND_MODE", "mock")
os.environ.setdefault("HEEL_LLM_TIMEOUT_S", "8")

from agents.brain import Director  # noqa: E402

N = int(sys.argv[1]) if len(sys.argv) > 1 else 10
TICKS = int(sys.argv[2]) if len(sys.argv) > 2 else 10
OUT = Path(os.environ.get("HEEL_SCHEME_OUT", "docs/lanes/agency-runs.json"))


def match(d: Director, i: int) -> dict:
    rng = random.Random(i)
    stamina = {w: 1.0 for w in ("vex", "kane", "silas", "mae", "p1")}
    for k in range(TICKS):
        t = k * 4000
        for w in stamina:
            stamina[w] = max(0.05, stamina[w] - rng.uniform(0.0, 0.15))
        ws = ["vex", "kane", "silas"] + (["mae"] if t >= 8000 else [])
        pin = None
        if k % 3 == 2:
            by, on = rng.sample(ws + ["p1"], 2)
            pin = {"by": by, "on": on}
        d.plan({"match": f"agency-{i}", "t_ms": t, "pin": pin, "crowd": {},
                "wrestlers": [{"id": w, "stamina": round(stamina[w], 2)} for w in ws],
                "humans": [{"id": "p1", "situation": rng.choice(["opening", "cornered"]),
                            "stamina": round(stamina["p1"], 2)}]})
        for pid, p in list(d.proposals.items()):
            if p["status"] == "pending":
                d.verdict(pid, "approve")
    return {}


def main() -> None:
    d = Director()
    assert d.planner.mode == "openai", "set OPENAI_API_KEY: this measures the LLM, not the fallback"
    per = []
    for i in range(N):
        start = len(d.log)
        match(d, i)
        rows, metas = d.log[start:], d.meta[start:]
        llm = sum(1 for m in metas if m.get("source") == "openai")
        fb = sum(1 for m in metas if m.get("source") == "fallback")
        per.append({
            "match": f"agency-{i}",
            "bribe_offered": [r for r in rows if r["intent"] == "bribe"],
            "bribe_accepted": [r for r in rows if r["intent"] == "bribe_accept" and not r.get("approved_by")],
            "bribe_declined": [r for r in rows if r["intent"] == "bribe_decline"],
            "betray_proposed": [r for r in rows if r["intent"] == "betray" and not (r.get("approved_by") or r.get("vetoed_by"))],
            "crooked_calls": [r for r in rows if r["intent"] in ("count_fast", "count_slow", "rope_miss", "cheat_miss")],
            "llm_calls": llm, "fallback_calls": fb,
        })
    def rate(key):
        return sum(1 for m in per if m[key]) / len(per)
    print(f"matches={N} ticks/match={TICKS} model={d.planner.model}")
    for m in per:
        print(f"  {m['match']}: offered={len(m['bribe_offered'])} accepted={len(m['bribe_accepted'])} "
              f"declined={len(m['bribe_declined'])} betray={len(m['betray_proposed'])} crooked={len(m['crooked_calls'])} "
              f"llm={m['llm_calls']} fallback={m['fallback_calls']}")
    for key in ("bribe_offered", "bribe_accepted", "betray_proposed", "crooked_calls"):
        print(f"matches with {key}: {rate(key):.0%}")
    offers = sum(len(m["bribe_offered"]) for m in per)
    acc = sum(len(m["bribe_accepted"]) for m in per)
    print(f"offers total={offers} accepted by Lou={acc} ({acc / offers:.0%} of offers)" if offers else "offers total=0")
    print("example reasons:")
    for key in ("bribe_offered", "bribe_accepted", "bribe_declined", "betray_proposed"):
        ex = next((r for m in per for r in m[key]), None)
        if ex:
            print(f"  {key}: {ex['wrestler']} -> {ex['target']}: {ex['reason']}")
    OUT.write_text(json.dumps(per, indent=1, default=str))
    print(f"rows: {OUT}")


if __name__ == "__main__":
    main()
