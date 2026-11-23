"""Scripted end-to-end run of the fan-points book. Run from repo root:  python3 -m agents.odds.demo
Isolated: everything it writes lives in agents/odds/.run/ (gitignored); the env vars point Bruin there.

1 seed: fixture events + the m5 card (entries only), fixture ref ledger, empty bets file -> bash bruin/run.sh
2 serve the book on :8790, read the m5 odds board and polls over HTTP
3 fans place 1-tap bets and vote (and one bet is refused)
4 feed the m5 match events: envelope, knockdown + kipup, Silas turns, eliminations -> markets settle
5 payouts + balances over HTTP, then bash bruin/run.sh on the full match: marts.fan_ledger agrees
6 tamper: settle m5 on the wrong winner in a copy of bets.jsonl -> the Bruin check blocks it
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import urllib.error
import urllib.request
from pathlib import Path

from agents.odds.__main__ import serve
from agents.odds.book import BRUIN, Book, bruin_rows

HERE = Path(__file__).resolve().parent
RUN = HERE / ".run"
PORT = int(os.environ.get("HEEL_ODDS_PORT", "8790"))
M = "m5"
CARD = ["silas", "brutus", "vex", "mae", "p1", "p2"]
MATCH = [  # (t_ms, actor, kind, target, success) - bribe_accept and kipup are book-only kinds
    (900, "silas", "alliance_offer", "brutus", True),
    (1200, "brutus", "alliance_reply", "silas", True),
    (6000, "brutus", "strike", "p1", True),
    (8000, "brutus", "elimination", "p1", True),
    (15000, "lou", "bribe_accept", "silas", True),
    (19000, "vex", "grapple", "p2", True),
    (20000, "vex", "elimination", "p2", True),
    (24000, "brutus", "knockdown", "mae", True),
    (25500, "mae", "kipup", None, True),
    (31000, "mae", "elimination", "vex", True),
    (36000, "silas", "betray", "brutus", True),
    (37000, "silas", "elimination", "brutus", True),
    (42000, "silas", "pin", "mae", True),
    (42500, "silas", "elimination", "mae", True),
]
BOOK_ONLY = {"bribe_accept", "bribe_decline", "kipup", "match_end"}


def ev(i, t, actor, kind, target, success):
    return {"event_id": f"{M}-{i:04d}", "match": M, "t_ms": t, "actor": actor, "kind": kind, "target": target,
            "situation": "opening", "success": success}


def call(method, path, body=None):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def bruin(env_bets: Path, label: str) -> bool:
    env = {**os.environ, "HEEL_TURN_EVENTS": str(RUN / "events.jsonl"), "HEEL_TURN_BETS": str(env_bets),
           "HEEL_TURN_REF_LEDGER": str(RUN / "ref_ledger.jsonl")}
    out = subprocess.run(["bash", str(BRUIN / "run.sh"), "--no-color"], env=env, capture_output=True, text=True)
    lines = (out.stdout + out.stderr).splitlines()
    keep = [l for l in lines if l.startswith(("PASS", "FAIL", "UPSTREAM", "bruin run", " ✓", " ✗"))
            or "returned" in l or "custom-check" in l and "FAIL" in l]
    print(f"\n  [bruin run.sh: {label}] exit {out.returncode}")
    for l in keep:
        print("   ", l.strip())
    return out.returncode == 0


def main() -> int:
    shutil.rmtree(RUN, ignore_errors=True)
    RUN.mkdir()
    print("== 1 seed fixtures")
    entries = [ev(i, 100 + i * 100, w, "entry", None, True) for i, w in enumerate(CARD)]
    fixture = (BRUIN / "fixtures" / "events.jsonl").read_text()
    # memory refreshes between matches only (an unfinished match fails marts.leaderboard's one-winner check)
    (RUN / "events.jsonl").write_text(fixture)
    shutil.copy(HERE / "fixtures" / "ref_ledger.jsonl", RUN / "ref_ledger.jsonl")
    shutil.copy(HERE / "fixtures" / "bets.jsonl", RUN / "bets.jsonl")  # m4 history: fan_ana won 310
    print(f"  {len(fixture.splitlines())} fixture events (m1-m4), 3 ref-ledger rows, 5 fixture bet lines")
    assert bruin(RUN / "bets.jsonl", "pre-show")

    print("\n== 2 odds board + polls over HTTP")
    srv = serve(PORT, Book(RUN, query=bruin_rows))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    _, r = call("POST", "/event", entries)
    print(f"  POST /event x{len(entries)} entries for {M}: {r}")
    _, odds = call("GET", f"/odds?match={M}")
    print(f"  GET /odds?match={M}  priced_from={odds['priced_from']}  sum(win_prob)={sum(r['win_prob'] for r in odds['board']):.4f}")
    for r in odds["board"]:
        print(f"    {r['name']:<14} {r['win_prob']:.3f}  line {r['line']:+5d}  pays x{r['decimal_odds']}")
    _, polls = call("GET", f"/polls?match={M}")
    for p in polls:
        print(f"  poll {p['id']:<10} {p['question']:<34} prior {p['prior']}  pays {p['decimal_odds']}")

    print("\n== 3 bets + votes (fan points)")
    bets = [("fan_ana", "vex", 200, "winner"), ("fan_bo", "silas", 100, "winner"), ("fan_cy", "p1", 50, "winner"),
            ("fan_ana", "yes", 50, "envelope"), ("fan_bo", "no", 40, "turn_silas"), ("fan_cy", "kipup", 30, "kipup")]
    for fan, pick, stake, market in bets:
        code, b = call("POST", "/bet", {"fan": fan, "pick": pick, "stake": stake, "match": M, "market": market})
        print(f"  POST /bet {fan:<8} {market:<10} {pick:<6} {stake:>4} -> {code} locked x{b.get('decimal_odds')} balance {b.get('balance')}")
    for body in ({"fan": "fan_dee", "pick": "vex", "stake": 5000, "match": M},
                 {"fan": "fan_dee", "pick": "hulk", "stake": 10, "match": M}):
        code, b = call("POST", "/bet", body)
        print(f"  POST /bet {body['pick']} {body['stake']} -> {code} {b}")
    votes = [("envelope", "yes")] * 5 + [("envelope", "no")] * 2 + [("turn_silas", "yes")] * 6 + [("turn_silas", "no")] * 3 \
        + [("kipup", "kipup")] * 4 + [("kipup", "stay_down")] * 4
    for i, (poll, choice) in enumerate(votes):
        call("POST", "/vote", {"poll": poll, "choice": choice, "match": M, "fan": f"v{i}"})
    code, b = call("POST", "/vote", {"poll": "envelope", "choice": "yes", "match": M, "fan": "v0"})
    print(f"  {len(votes)} votes cast; repeat vote by v0 -> {code} {b}")
    _, polls = call("GET", f"/polls?match={M}")
    for p in polls:
        print(f"  {p['id']:<10} " + "  ".join(f"{c} {'#' * round(s * 20):<20} {s:.0%}" for c, s in p["share"].items()))

    print("\n== 4 match events -> resolution")
    full = entries + [ev(len(CARD) + i, *row) for i, row in enumerate(MATCH)]
    for e in full[len(CARD):]:
        _, r = call("POST", "/event", e)
        tag = ", ".join(f"{s['market']}={s['outcome']}" for s in r["settled"])
        print(f"  t={e['t_ms']:>6} {e['actor']:<6} {e['kind']:<14} {e['target'] or '':<7} {('SETTLED ' + tag) if tag else ''}")

    print("\n== 5 payouts")
    for fan in ("fan_ana", "fan_bo", "fan_cy"):
        _, f = call("GET", f"/fan?fan={fan}")
        tickets = "; ".join(f"{b['match']} {b['market']} {b['pick']} {b['stake']}->{b['status']} {b['payout']}" for b in f["bets"])
        print(f"  {fan:<8} balance {f['balance']:>5} {f['currency']} | {tickets}")
    with open(RUN / "events.jsonl", "a") as fh:
        fh.writelines(json.dumps(e) + "\n" for e in full if e["kind"] not in BOOK_ONLY)
    assert bruin(RUN / "bets.jsonl", "after m5")
    rows = bruin_rows("SELECT fan_id, sum(payout) - sum(stake) AS net, count(*) AS bets, "
                      "count(*) FILTER (WHERE status = 'won') AS won FROM marts.fan_ledger GROUP BY 1 ORDER BY 1")
    print("  marts.fan_ledger net per fan (all matches):", rows)
    for fan in ("fan_ana", "fan_bo", "fan_cy"):
        _, f = call("GET", f"/fan?fan={fan}")
        net = next(r["net"] for r in rows if r["fan_id"] == fan)
        print(f"  {fan}: service balance {f['balance']} == 1000 + bruin net {net}: {f['balance'] == 1000 + net}")
    print("  marts.ref_ledger lou:", bruin_rows("SELECT briber, offers, accepted, round(take_rate, 3) AS take_rate "
                                                "FROM marts.ref_ledger ORDER BY briber"))

    print("\n== 6 tamper: settle m5 on the wrong winner")
    bad = RUN / "bets_tampered.jsonl"
    lines = [l for l in (RUN / "bets.jsonl").read_text().splitlines()
             if not ('"type": "result"' in l and f'"match": "{M}"' in l and '"market": "winner"' in l)]
    lines.append(json.dumps({"type": "result", "match": M, "market": "winner", "outcome": "vex", "ts": 0}))
    bad.write_text("\n".join(lines) + "\n")
    ok = bruin(bad, "tampered")
    print(f"  tampered run blocked: {not ok}")
    srv.shutdown()
    return 0 if not ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
