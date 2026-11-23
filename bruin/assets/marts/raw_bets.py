""" @bruin

name: raw.bets
type: python
image: python:3.11
connection: duckdb-default
description: |
  Fan-points wagers (play money only, no real currency anywhere). The odds service
  (agents/odds/server.py) appends one JSON line per bet and one per resolved market to
  bruin/data/bets.jsonl; when that is missing or empty this reads agents/odds/fixtures/bets.jsonl.
  HEEL_TURN_BETS overrides the path.
    bet:    {"type": "bet", "bet_id", "fan", "match", "market", "pick", "stake", "decimal_odds", "ts"}
    result: {"type": "result", "match", "market", "outcome", "ts"}
  market is "winner" (pick = wrestler id) or a poll id (pick = a poll choice).

materialization:
  type: table
  strategy: create+replace

columns:
  - name: type
    type: varchar
  - name: bet_id
    type: varchar
  - name: fan
    type: varchar
  - name: match
    type: varchar
  - name: market
    type: varchar
  - name: pick
    type: varchar
  - name: stake
    type: bigint
  - name: decimal_odds
    type: double
  - name: outcome
    type: varchar
  - name: ts
    type: bigint

@bruin """

import json
import os
from pathlib import Path

import pandas as pd

BRUIN = Path(__file__).resolve().parents[2]  # bruin/
FIELDS = ["type", "bet_id", "fan", "match", "market", "pick", "stake", "decimal_odds", "outcome", "ts"]


def bets_path():
    if os.environ.get("HEEL_TURN_BETS"):
        return Path(os.environ["HEEL_TURN_BETS"])
    live = BRUIN / "data" / "bets.jsonl"
    return live if live.exists() and live.stat().st_size > 0 else BRUIN.parent / "agents" / "odds" / "fixtures" / "bets.jsonl"


def materialize():
    rows = []
    for line in bets_path().read_text().splitlines():
        if line.strip():
            e = json.loads(line)
            rows.append({f: e.get(f) for f in FIELDS})
    df = pd.DataFrame(rows, columns=FIELDS)
    for f in ("type", "bet_id", "fan", "match", "market", "pick", "outcome"):
        df[f] = df[f].astype("string")
    for f in ("stake", "ts"):
        df[f] = pd.to_numeric(df[f], errors="coerce").astype("Int64")
    df["decimal_odds"] = pd.to_numeric(df["decimal_odds"], errors="coerce").astype("Float64")
    return df
