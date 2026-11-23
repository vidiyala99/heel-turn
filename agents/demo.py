"""Mock end-to-end match showing the four BAND signals. Run from repo root:  python3 -m agents.demo
Exits non-zero if any signal is missing. Uses MockBand always; planner is OpenAI if OPENAI_API_KEY is set.
"""
from __future__ import annotations

import statistics
import sys

from agents.brain import COMM, REF, WRESTLERS, Director
from agents.transport import MockBand


def state(t, wrestlers, pin=None, down=()):
    return {
        "match": "m13", "t_ms": t,
        "wrestlers": [{"id": w, "stamina": 0.25 if w in down else 0.8, "down": w in down} for w in wrestlers],
        "humans": [{"id": "p1", "situation": "opening", "stamina": 0.7}, {"id": "p2", "situation": "cornered", "stamina": 0.6}],
        "crowd": {"vex": 0.3}, "ref": {"attention": "watching"}, "pin": pin,
    }


def show(rows):
    for r in rows:
        extra = "".join(f" {k}={r[k]}" for k in ("approved_by", "vetoed_by") if r.get(k))
        print(f"  t={r['t_ms']:>6} {r['wrestler']:<6} {r['intent']:<13} -> {str(r['target']):<6} | {r['reason']} | cites={r['cites']}{extra}")


def main() -> int:
    cast = {**{w: "agent" for w in WRESTLERS}, REF["id"]: "agent", COMM: "human"}
    band = MockBand(cast)
    d = Director(transport=band)
    ok = {}
    lat = []

    print(f"== HEEL TURN agents demo  band={band.mode} planner={d.planner.mode} memory={d.memory.source}")
    out = d.plan(state(0, ["vex", "kane", "silas"]))
    lat.append(out)
    print("\n-- tick t=0 plans"); show(out["plans"])

    # SIGNAL 1: private locker rooms + mention-scoped delivery
    heel, face, ring = d.rooms["heel"], d.rooms["face"], d.rooms["ring"]
    kane_sees_heel = band.inbox("kane", heel)
    vex_sees_heel = band.inbox("vex", heel)
    print("\n[1] PRIVATE LOCKER ROOMS (mention-scoped boundary)")
    print(f"  heel room members={band.participants(heel)}  face room members={band.participants(face)}")
    print(f"  vex received {len(vex_sees_heel)} heel-room msgs; kane received {len(kane_sees_heel)} (not a member)")
    for m in vex_sees_heel:
        print(f"    vex <- {m.sender}: {m.text}")
    ok["1 private rooms"] = len(vex_sees_heel) > 0 and not kane_sees_heel and COMM not in band.participants(heel)

    # SIGNAL 2: new entrant added at runtime
    out = d.plan(state(8000, ["vex", "kane", "silas", "mae"]))
    lat.append(out)
    adds = [l for l in band.console if "add=mae" in l]
    looks = [l for l in band.console if l.startswith("band_lookup_peers")]
    print("\n[2] RUNTIME ENTRANT (band_lookup_peers -> band_add_participant)")
    for l in looks + adds:
        print("  " + l)
    entry = [m for m in band.messages if "NEW ENTRANT" in m.text][0]
    vex_got_entry = any(m.id == entry.id for m in band.inbox("vex", ring))
    print(f"  ring msg {entry.text!r} mentions {entry.mentions}; vex (in ring, not mentioned) received it: {vex_got_entry}")
    ok["2 runtime entrant"] = bool(looks) and len(adds) >= 2 and "mae" in band.participants(ring) and not vex_got_entry

    # SIGNAL 3: alliance offers answered by their target
    print("\n[3] ALLIANCE OFFER -> ANSWERED BY TARGET (dependent handoff)")
    for m in band.messages:
        if m.text.startswith(("ALLIANCE?", "ACCEPT.", "REFUSE.")):
            print(f"  [{band.rooms[m.room]['title']}] {m.sender} -> @{','.join(m.mentions)}: {m.text}")
    answered = [m for m in band.messages if m.text.startswith(("ACCEPT.", "REFUSE.")) and m.sender == "mae"]
    ok["3 alliance answered"] = len(answered) >= 2 and any(m.text.startswith("REFUSE.") for m in answered)

    # SIGNAL 4: betrayal proposal -> commissioner approves; bribe -> commissioner blocks
    out = d.plan(state(12000, ["vex", "kane", "silas", "mae"]))
    lat.append(out)
    print("\n[4] COMMISSIONER APPROVE / BLOCK (blockable verdict)")
    pend = {p["id"]: p for p in out["pending"]}
    print(f"  pending after t=12000: {list(pend)}")
    for p in pend.values():
        print(f"    {p['id']}: {p['plan']['wrestler']} {p['plan']['intent']} {p['plan']['target']} - {p['plan']['reason']}")
    silas_now = next(r for r in out["plans"] if r["wrestler"] == "silas")
    print(f"  silas while pending: {silas_now['intent']} {silas_now['target']} ({silas_now['reason']})")
    bt = next(pid for pid in pend if pid.startswith("betray"))
    d.verdict(bt, "approve")
    out = d.plan(state(16000, ["vex", "kane", "silas", "mae"]))
    lat.append(out)
    silas_turn = next(r for r in out["plans"] if r["wrestler"] == "silas")
    print(f"  commissioner: approve {bt} -> silas plan at t=16000: {silas_turn['intent']} {silas_turn['target']} approved_by={silas_turn.get('approved_by')}")
    br = next((p["id"] for p in out["pending"] if p["kind"] == "bribe"), None)
    print(f"  bribe proposal after Lou weighed his ledger: {br}")
    if br:
        d.verdict(br, "block")
    out = d.plan(state(20000, ["vex", "kane", "silas", "mae"], pin={"by": "silas", "on": "kane"}, down=("kane",)))
    lat.append(out)
    lou = next(r for r in out["plans"] if r["wrestler"] == "lou")
    print(f"  commissioner: block {br} -> silas pins kane, Lou calls: {lou['intent']} ({lou['reason']})")
    desk_vex = band.inbox("vex", d.rooms["desk"])
    print(f"  vex (the betrayed) saw {len(desk_vex)} desk msgs; commissioner saw {len(band.inbox(COMM, d.rooms['desk']))}")
    ok["4 commissioner verdict"] = (silas_turn["intent"] == "betray" and silas_turn.get("approved_by") == COMM and br is not None
                                    and lou["intent"] == "count_fair" and any(r.get("vetoed_by") for r in d.log) and not desk_vex)

    print("\n-- decision log (GET /log rows)")
    show(d.log)
    print("\n-- BAND console")
    for l in band.console:
        print("  " + l)

    print("\n-- latency (measured)")
    per = [m["ms"] for o in lat for m in o["meta"]]
    for i, o in enumerate(lat):
        print(f"  tick {i}: /plan total {o['latency_ms']} ms; per agent " +
              ", ".join(f"{m['who']}={m['ms']}ms/{m['source']}" for m in o["meta"]))
    print(f"  per-agent decide: n={len(per)} p50={statistics.median(per):.1f}ms max={max(per):.1f}ms")

    print("\n== SIGNALS")
    for k, v in ok.items():
        print(f"  {'PASS' if v else 'FAIL'}  {k}")
    return 0 if all(ok.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
