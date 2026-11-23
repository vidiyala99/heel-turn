"""Fan-points book: odds board, 1-tap bets, prop polls, settlement. PLAY MONEY ONLY.

Fan points have no cash value, cannot be bought, sold or withdrawn. Every fan starts with START points.

Prices come from the Bruin marts (marts.odds, marts.props) via `bruin query`; the price is locked into
the bet line so a later refresh never changes what a ticket pays. Every bet and every market result is
appended to bets.jsonl, which Bruin reads back as raw.bets -> marts.fan_ledger.

Polls are the agents' storylines turned into props, scoped per match:
  envelope    "Will Lou take the envelope?"        yes / no         resolves on bribe_accept / bribe_decline
  turn_silas  "Will Silas turn on his partner?"    yes / no         resolves on betray by silas
  kipup       "Kipup or stay down?"                kipup / stay_down after a knockdown: kipup by the
                                                   downed wrestler, or pin / elimination of them
Unresolved polls close "no" / "stay_down" at match end; the winner market settles on match_end
(or when one entrant is left standing).
"""
from __future__ import annotations

import csv
import json
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BRUIN = ROOT / "bruin"
START = 1000
MAX_STAKE = 500
POLLS = {
    "envelope": ("Will Lou take the envelope?", ("yes", "no"), "envelope"),
    "turn_silas": ("Will Silas turn on his partner?", ("yes", "no"), "turn_silas"),
    "kipup": ("Kipup or stay down?", ("kipup", "stay_down"), "kipup"),
}
CLOSE_AS = {"envelope": "no", "turn_silas": "no", "kipup": "stay_down"}


class BetError(ValueError):
    pass


def roster() -> dict[str, dict]:
    with open(BRUIN / "assets" / "seeds" / "wrestlers.csv") as f:
        return {r["wrestler"]: r for r in csv.DictReader(f)}


def bruin_rows(sql: str) -> list[dict]:
    exe = shutil.which("bruin") or str(Path.home() / ".local" / "bin" / "bruin")
    out = subprocess.run([exe, "query", "--config-file", str(BRUIN / ".bruin.yml"), "-c", "duckdb-default",
                          "-o", "json", "-q", sql], cwd=BRUIN, capture_output=True, text=True, timeout=30, check=True)
    data = json.loads(out.stdout)
    return [dict(zip([c["name"] for c in data["columns"]], r)) for r in data["rows"]]


def american(p: float) -> int:
    p = min(max(p, 0.01), 0.99)
    return -round(100 * p / (1 - p)) if p >= 0.5 else round(100 * (1 - p) / p)


class Book:
    def __init__(self, data_dir: Path | None = None, query=bruin_rows):
        self.dir = Path(data_dir or os.environ.get("HEEL_ODDS_DIR") or BRUIN / "data")
        self.dir.mkdir(parents=True, exist_ok=True)
        self.bets_file = self.dir / "bets.jsonl"
        self.ref_file = self.dir / "ref_ledger.jsonl"
        self.query = query
        self.roster = roster()
        self.lock = threading.RLock()
        self.bets: list[dict] = []
        self.results: dict[tuple[str, str], str] = {}
        self.price_cache: dict[str, dict] = {}
        self.polls: dict[str, dict] = {}       # key f"{match}:{poll}"
        self.voters: set[tuple[str, str]] = set()
        self.live: dict[str, dict] = {}       # match -> {entered, out, downed}
        self._replay()

    # --- persistence --------------------------------------------------------------------------------
    def _replay(self) -> None:
        if not self.bets_file.exists():
            return
        for line in self.bets_file.read_text().splitlines():
            if line.strip():
                r = json.loads(line)
                if r["type"] == "bet":
                    self.bets.append(r)
                elif r["type"] == "result":
                    self.results[(r["match"], r["market"])] = r["outcome"]

    def _append(self, path: Path, row: dict) -> None:
        with open(path, "a") as f:
            f.write(json.dumps(row) + "\n")

    # --- prices -------------------------------------------------------------------------------------
    def refresh(self) -> None:
        with self.lock:
            self.price_cache.clear()

    def _prices(self, match: str) -> dict:
        if match in self.price_cache:
            return self.price_cache[match]
        assert match.replace("_", "").replace("-", "").isalnum(), "bad match id"
        odds = self.query(f"SELECT * FROM marts.odds WHERE match_id IN ('{match}', 'next')")
        props = self.query(f"SELECT * FROM marts.props WHERE match_id IN ('{match}', 'next')")
        src = match if any(r["match_id"] == match for r in odds) else "next"
        board = [r for r in odds if r["match_id"] == src]
        entered = self.live.get(match, {}).get("entered")
        if src == "next" and entered:  # live card not in the marts yet: renormalise the roster prior
            board = [r for r in board if r["wrestler"] in entered]
            total = sum(r["win_prob"] for r in board) or 1
            board = [{**r, "win_prob": r["win_prob"] / total} for r in board]
        board = [{"wrestler": r["wrestler"], "name": self.roster.get(r["wrestler"], {}).get("display_name", r["wrestler"]),
                  "win_prob": round(r["win_prob"], 4), "line": american(r["win_prob"]),
                  "decimal_odds": round(1 / r["win_prob"], 2)} for r in board]
        board.sort(key=lambda r: -r["win_prob"])
        prior = {r["prop"]: r["prob"] for r in props if r["match_id"] == src}
        self.price_cache[match] = {"match": match, "priced_from": src, "board": board, "props": prior}
        return self.price_cache[match]

    def odds(self, match: str) -> dict:
        with self.lock:
            p = self._prices(match)
            return {"match": match, "priced_from": p["priced_from"], "board": p["board"],
                    "settled": self.results.get((match, "winner"))}

    # --- polls --------------------------------------------------------------------------------------
    def _poll(self, match: str, pid: str) -> dict:
        key = f"{match}:{pid}"
        if key not in self.polls:
            if pid not in POLLS:
                raise BetError(f"unknown poll {pid}")
            q, choices, prop = POLLS[pid]
            p = float(self._prices(match)["props"].get(prop, 0.5))
            prior = {choices[0]: p, choices[1]: 1 - p}
            self.polls[key] = {"id": pid, "match": match, "question": q, "choices": list(choices),
                               "prior": {c: round(v, 3) for c, v in prior.items()},
                               "votes": {c: 0 for c in choices}, "status": "open",
                               "outcome": self.results.get((match, pid))}
            if self.polls[key]["outcome"]:
                self.polls[key]["status"] = "resolved"
        return self.polls[key]

    def polls_for(self, match: str) -> list[dict]:
        with self.lock:
            out = []
            for pid in POLLS:
                p = dict(self._poll(match, pid))
                n = sum(p["votes"].values())
                p["share"] = {c: (v / n if n else 0.0) for c, v in p["votes"].items()}
                p["decimal_odds"] = {c: self._prop_odds(p, c) for c in p["choices"]}
                out.append(p)
            return out

    def vote(self, match: str, pid: str, choice: str, fan: str | None = None) -> dict:
        with self.lock:
            p = self._poll(match, pid)
            if choice not in p["choices"]:
                raise BetError(f"{choice} is not a choice in {pid}")
            if p["status"] != "open":
                raise BetError(f"{pid} is closed")
            if fan:
                if (fan, f"{match}:{pid}") in self.voters:
                    raise BetError("one vote per fan per poll")
                self.voters.add((fan, f"{match}:{pid}"))
            p["votes"][choice] += 1
            return p

    @staticmethod
    def _prop_odds(p: dict, choice: str) -> float:
        return round(1 / min(max(p["prior"][choice], 0.05), 0.95), 2)

    # --- bets ---------------------------------------------------------------------------------------
    def balance(self, fan: str) -> int:
        with self.lock:
            bal = START
            for b in self.bets:
                if b["fan"] == fan:
                    bal -= b["stake"]
                    bal += self._payout(b)
            return bal

    def _payout(self, b: dict) -> int:
        out = self.results.get((b["match"], b["market"]))
        return round(b["stake"] * b["decimal_odds"]) if out is not None and out == b["pick"] else 0

    def bet(self, fan: str, pick: str, stake, match: str, market: str = "winner") -> dict:
        with self.lock:
            if not fan or not str(fan).replace("_", "").isalnum():
                raise BetError("fan id must be letters, digits, underscore")
            if not isinstance(stake, int) or isinstance(stake, bool) or not 1 <= stake <= MAX_STAKE:
                raise BetError(f"stake must be a whole number of fan points from 1 to {MAX_STAKE}")
            if stake > self.balance(fan):
                raise BetError("not enough fan points")
            if (match, market) in self.results:
                raise BetError(f"{market} for {match} is already settled")
            if market == "winner":
                row = next((r for r in self._prices(match)["board"] if r["wrestler"] == pick), None)
                if row is None:
                    raise BetError(f"{pick} is not on the {match} card")
                if pick in self.live.get(match, {}).get("out", set()):
                    raise BetError(f"{pick} is already eliminated")
                price = row["decimal_odds"]
            else:
                p = self._poll(match, market)
                if pick not in p["choices"] or p["status"] != "open":
                    raise BetError(f"{pick} is not open in {market}")
                price = self._prop_odds(p, pick)
            b = {"type": "bet", "bet_id": f"{match}-{len(self.bets) + 1}-{int(time.time() * 1000) % 100000}",
                 "fan": fan, "match": match, "market": market, "pick": pick, "stake": stake,
                 "decimal_odds": price, "ts": int(time.time() * 1000)}
            self.bets.append(b)
            self._append(self.bets_file, b)
            return {**b, "balance": self.balance(fan)}

    def fan(self, fan: str) -> dict:
        with self.lock:
            mine = [{**b, "status": ("open" if (b["match"], b["market"]) not in self.results
                                     else "won" if self._payout(b) else "lost"), "payout": self._payout(b)}
                    for b in self.bets if b["fan"] == fan]
            return {"fan": fan, "balance": self.balance(fan), "bets": mine, "currency": "fan points (play money)"}

    # --- resolution from match events ---------------------------------------------------------------
    def _settle(self, match: str, market: str, outcome: str) -> None:
        if (match, market) in self.results:
            return
        self.results[(match, market)] = outcome
        self._append(self.bets_file, {"type": "result", "match": match, "market": market, "outcome": outcome,
                                      "ts": int(time.time() * 1000)})
        if market in POLLS:
            p = self._poll(match, market)
            p["status"], p["outcome"] = "resolved", outcome

    def event(self, e: dict) -> list[dict]:
        """Feed one match event (same shape as bruin events.jsonl, plus kinds bribe_accept, bribe_decline,
        kipup, match_end). Returns the markets this event settled."""
        with self.lock:
            m = e["match"]
            kind, actor, target = e.get("kind"), e.get("actor"), e.get("target")
            st = self.live.setdefault(m, {"entered": set(), "out": set(), "downed": None})
            before = set(self.results)
            if kind == "entry":
                st["entered"].add(actor)
                self.price_cache.pop(m, None)
            elif kind in ("bribe_accept", "bribe_decline"):
                self._settle(m, "envelope", "yes" if kind == "bribe_accept" else "no")
                self._append(self.ref_file, {"ref": actor, "match": m, "bribe_from": target,
                                             "accepted": kind == "bribe_accept", "caught": False})
            elif kind == "betray" and actor == "silas":
                self._settle(m, "turn_silas", "yes")
            elif kind == "knockdown":
                st["downed"] = target
            elif kind == "kipup" and st["downed"] and actor == st["downed"]:
                self._settle(m, "kipup", "kipup")
            elif kind in ("pin", "elimination") and st["downed"] and target == st["downed"]:
                if kind == "elimination" or e.get("success", True):
                    self._settle(m, "kipup", "stay_down")
            if kind == "elimination":
                st["out"].add(target)
                left = st["entered"] - st["out"]
                if len(st["entered"]) > 1 and len(left) == 1:
                    kind, e = "match_end", {**e, "winner": next(iter(left))}
            if kind == "match_end":
                self._settle(m, "winner", e["winner"])
                for pid, outcome in CLOSE_AS.items():
                    self._settle(m, pid, outcome)
            return [{"match": k[0], "market": k[1], "outcome": self.results[k]} for k in self.results if k not in before]
