"""Measure planner latency per model. Run from repo root:  python3 -m agents.latency [model ...]  (N per model: HEEL_LAT_N, default 3)
Needs OPENAI_API_KEY. Prints per-call ms, p50, max, and how many calls fell back.
"""
from __future__ import annotations

import os
import statistics
import sys

from agents.brain import TRIANGLE, WRESTLERS
from agents.memory import Memory
from agents import planner as pl


def main() -> int:
    models = sys.argv[1:] or [os.environ.get("OPENAI_MODEL", "gpt-5-mini")]
    n = int(os.environ.get("HEEL_LAT_N", "3"))
    os.environ.setdefault("HEEL_LLM_TIMEOUT_S", "30")
    m = Memory()
    p = WRESTLERS["silas"]
    state = {"t_ms": 0, "wrestlers": [{"id": w, "stamina": 0.8} for w in ("vex", "silas", "kane")],
             "humans": [{"id": "p1", "situation": "opening", "stamina": 0.7}]}
    snap = m.snapshot_for("silas", ["p1", "vex", "kane"])
    fb = pl.fallback_wrestler(p, state, m, TRIANGLE, {})
    for model in models:
        os.environ["OPENAI_MODEL"] = model
        planner = pl.Planner()
        if not planner.key:
            print("OPENAI_API_KEY not set")
            return 1
        ms, fails = [], 0
        for _ in range(n):
            row, meta = planner.decide(p, "plan your next 4 seconds", state, snap, pl.WRESTLER_INTENTS, ("p1", "vex", "kane"), fb)
            ms.append(meta["ms"])
            fails += meta["source"] != "openai"
            print(f"  {model} reasoning={planner.reasoning or '-'} {meta['ms']:>8.1f} ms {meta['source']:<8} {row['intent']} {row['target']} | {row['reason']}"
                  + (f" | {meta['error']}" if meta.get("error") else ""))
        print(f"{model}: n={n} p50={statistics.median(ms):.0f}ms max={max(ms):.0f}ms fallbacks={fails}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
