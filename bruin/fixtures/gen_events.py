"""Generate bruin/fixtures/events.jsonl: deterministic fake matches in the PLAN event schema.

Two humans with fixed habits, four AI wrestlers whose counter rate rises match to match (memory),
an alliance (silas + brutus), a betrayal (silas betrays brutus in m2), a refused offer in m3, pins,
kickouts, eliminations and one winner per match.

    python3 bruin/fixtures/gen_events.py   # rewrites bruin/fixtures/events.jsonl
"""
import json
import random
from pathlib import Path

MOVES = ("strike", "grapple", "block")
BEATS = {"strike": "block", "grapple": "strike", "block": "grapple"}  # BEATS[m] = the move that beats m
HUMANS = ("p1", "p2")
AIS = ("vex", "brutus", "silas", "mae")
# situation -> (strike, grapple, block) weights
HABITS = {
    "p1": {"opening": (7, 2, 1), "after_block": (2, 6.5, 1.5), "low_stamina": (2, 2, 6), "cornered": (6, 1, 3)},
    "p2": {"opening": (2, 6, 2), "after_block": (6, 2, 2), "low_stamina": (3, 4, 3), "cornered": (1, 2, 7)},
}
COUNTER_SKILL = {"m1": 0.30, "m2": 0.45, "m3": 0.60, "m4": 0.72}  # AI learns the human habits over matches
TAUNTS = {
    "vex": ["Look at me, the cameras love me and they hate you!", "Hold the applause, I'm only getting started."],
    "brutus": ["I will fold you in half.", "Nobody stands up after Brutus Kane."],
    "silas": ["Trust is for people who lose.", "Shake my hand. Go on. What could happen?"],
    "mae": ["Respect the ring, kid, it remembers everything.", "Thank you all, this one's for the folks in the cheap seats!"],
    "p1": ["Is that all you've got?", "Come on, crowd, let me hear you!"],
    "p2": ["You're finished, old timer.", "Good match. Now get out of my ring."],
}
SITUATIONS = ("opening", "after_block", "low_stamina", "cornered")


def match_events(match, rng):
    ev, t = [], 0

    def emit(actor, kind, situation, target=None, success=None, text=None):
        nonlocal t
        t += rng.randint(250, 900)
        row = {"event_id": f"{match}-{len(ev):04d}", "match": match, "t_ms": t, "actor": actor, "kind": kind,
               "situation": situation}
        if target is not None:
            row["target"] = target
        if success is not None:
            row["success"] = success
        if text is not None:
            row["text"] = text
        ev.append(row)

    alive = list(HUMANS + AIS)
    rng.shuffle(alive)
    for w in alive:
        emit(w, "entry", "opening")
    emit("booth", "commentary", "opening", text=f"Over the Top, {match}: six bodies, one ring.")

    # Alliance arc: m1 offer accepted, m2 betrayal, m3 offer refused (grudge), m4 Brutus allies with Mae.
    arc = {
        "m1": [("silas", "alliance_offer", "brutus", None, "Silas: you and me clear the ring, then we settle it."),
               ("brutus", "alliance_reply", "silas", True, "Fine. Watch my back.")],
        "m2": [("silas", "plan", "brutus", None, "betray brutus: he is tired and the ring is crowded"),
               ("silas", "betray", "brutus", True, "Nothing personal, big man.")],
        "m3": [("silas", "alliance_offer", "brutus", None, "Let bygones be bygones?"),
               ("brutus", "alliance_reply", "silas", False, "You stabbed me in the back last time.")],
        "m4": [("brutus", "alliance_offer", "mae", None, "You fight fair. Partners?"),
               ("mae", "alliance_reply", "brutus", True, "Partners, till the bell.")],
    }[match]
    arc_at = {3 + 2 * i: a for i, a in enumerate(arc)}  # early, while everyone is still in the ring

    stamina = {w: 100 for w in alive}
    exchanges = 0
    while len(alive) > 1:
        exchanges += 1
        if exchanges in arc_at:
            a, kind, b, ok, text = arc_at[exchanges]
            if a in alive and b in alive:
                emit(a, kind, "opening", target=b, success=ok, text=text)
        attacker = rng.choices(alive, weights=[3 if w in HUMANS else 1 for w in alive])[0]  # humans press
        target = rng.choice([w for w in alive if w != attacker])
        sit = ("low_stamina" if stamina[attacker] < 35 else
               rng.choice(("opening", "after_block", "cornered", "opening")))
        if rng.random() < 0.08:
            emit(attacker, "taunt", sit, target=target, text=rng.choice(TAUNTS[attacker]))
            continue
        if rng.random() < 0.06 and attacker in AIS:
            emit(attacker, "plan", sit, target=target, text=f"counter {target}'s {sit} habit")
        if attacker in HUMANS:
            move = rng.choices(MOVES, weights=HABITS[attacker][sit])[0]
        else:
            move = rng.choice(MOVES)
        emit(attacker, move, sit, target=target, success=rng.random() < 0.5)
        # Target answers. An AI answering a human uses memory: counters with the learned skill.
        if target in AIS and attacker in HUMANS and rng.random() < COUNTER_SKILL[match]:
            reply = BEATS[move]
        else:
            reply = rng.choice(MOVES)
        countered = reply == BEATS[move]
        emit(target, reply, "after_block" if move == "block" else sit, target=attacker, success=countered)
        if countered:
            stamina[attacker] -= rng.randint(12, 24)
        else:
            stamina[target] -= rng.randint(8, 16)
        for loser, winner in ((attacker, target), (target, attacker)):
            if stamina[loser] <= 15 and loser in alive:
                emit(winner, "knockdown", "low_stamina", target=loser, success=True)
                if rng.random() < 0.5:
                    pinned = rng.random() < 0.6
                    emit(winner, "pin", "low_stamina", target=loser, success=pinned)
                    if not pinned:
                        emit(loser, "kickout", "low_stamina", target=winner, success=True)
                        stamina[loser] = 30
                        break
                emit(winner, "elimination", "cornered", target=loser, success=True,
                     text=f"{loser} goes over the top rope")
                alive.remove(loser)
                break
    emit("booth", "commentary", "opening", target=alive[0], text=f"{alive[0]} is the last one standing!")
    return ev


def main():
    rng = random.Random(23)
    rows = [e for m in ("m1", "m2", "m3", "m4") for e in match_events(m, rng)]
    out = Path(__file__).with_name("events.jsonl")
    out.write_text("".join(json.dumps(r) + "\n" for r in rows))
    print(f"wrote {len(rows)} events to {out}")


if __name__ == "__main__":
    main()
