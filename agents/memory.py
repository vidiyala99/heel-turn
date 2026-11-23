"""Bruin mart reader. Every agent reads its memory here before every plan.

HEEL_BRUIN_DUCKDB=<path to bruin duckdb file> -> read live marts (needs `pip install duckdb`).
Unset / missing file / no duckdb -> stub rows from agents/fixtures/marts.json (source == "stub").
HEEL_BRUIN_SCHEMA (default "marts") is tried first, then unqualified table names.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

MARTS = ("habits", "relationships", "leaderboard", "ref_ledger", "partner_trust")
FIXTURE = Path(__file__).parent / "fixtures" / "marts.json"


def cite(mart: str, row: dict) -> str:
    """Stable `mart.key` id for a row, used in plan.cites."""
    if mart == "habits":
        return f"habits.{row['player']}/{row['situation']}/{row['move']}"
    if mart in ("relationships", "partner_trust"):
        return f"{mart}.{row['a']}>{row['b']}"
    if mart == "leaderboard":
        return f"leaderboard.{row['wrestler']}"
    if mart == "ref_ledger":
        return f"ref_ledger.{row['ref']}/{row['match']}"
    return f"{mart}.?"


class Memory:
    def __init__(self, db_path: str | None = None):
        self.db_path = db_path if db_path is not None else os.environ.get("HEEL_BRUIN_DUCKDB")
        self.source = "stub"
        self.tables: dict[str, list[dict]] = {}
        self.refresh()

    def refresh(self) -> None:
        if self.db_path and Path(self.db_path).exists():
            try:
                self.tables = self._read_duckdb(self.db_path)
                self.source = f"duckdb:{self.db_path}"
                return
            except Exception as e:  # fall through to stub, but say why
                self.source = f"stub (duckdb read failed: {type(e).__name__}: {e})"
        else:
            self.source = "stub"
        data = json.loads(FIXTURE.read_text())
        self.tables = {m: data.get(m, []) for m in MARTS}

    @staticmethod
    def _read_duckdb(path: str) -> dict[str, list[dict]]:
        import duckdb  # optional dependency

        schema = os.environ.get("HEEL_BRUIN_SCHEMA", "marts")
        con = duckdb.connect(path, read_only=True)
        out: dict[str, list[dict]] = {}
        try:
            for m in MARTS:
                for name in (f"{schema}.{m}", m):
                    try:
                        cur = con.execute(f"select * from {name}")
                    except Exception:
                        continue
                    cols = [d[0] for d in cur.description]
                    out[m] = [dict(zip(cols, r)) for r in cur.fetchall()]
                    break
                else:
                    out[m] = []
        finally:
            con.close()
        return out

    # --- views each agent reads -------------------------------------------------
    def habits_of(self, player: str, situation: str | None = None) -> list[dict]:
        rows = [r for r in self.tables["habits"] if r["player"] == player]
        if situation:
            rows = [r for r in rows if r["situation"] == situation]
        return sorted(rows, key=lambda r: -float(r["share"]))

    def relation(self, a: str, b: str) -> dict | None:
        for r in self.tables["relationships"]:
            if r["a"] == a and r["b"] == b:
                return r
        return None

    def partner(self, a: str, b: str) -> dict | None:
        for r in self.tables["partner_trust"]:
            if r["a"] == a and r["b"] == b:
                return r
        return None

    def ref_ledger(self, ref: str = "lou") -> list[dict]:
        return [r for r in self.tables["ref_ledger"] if r["ref"] == ref]

    def snapshot_for(self, agent_id: str, opponents: list[str]) -> dict:
        """Everything one agent may see, with cite ids attached (fed to the LLM)."""
        rows = []
        for p in opponents:
            for r in self.habits_of(p):
                rows.append({"cite": cite("habits", r), **r})
        for mart in ("relationships", "partner_trust"):
            for r in self.tables[mart]:
                if r["a"] == agent_id:
                    rows.append({"cite": cite(mart, r), **r})
        for r in self.tables["leaderboard"]:
            if r["wrestler"] == agent_id:
                rows.append({"cite": cite("leaderboard", r), **r})
        if agent_id == "lou":
            for r in self.ref_ledger("lou"):
                rows.append({"cite": cite("ref_ledger", r), **r})
        return {"source": self.source, "rows": rows}
