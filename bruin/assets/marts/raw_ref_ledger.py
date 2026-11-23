""" @bruin

name: raw.ref_ledger
type: python
image: python:3.11
connection: duckdb-default
description: |
  Every envelope offered to the referee, one row per line of the ref ledger file. Reads
  bruin/data/ref_ledger.jsonl (the agents server appends a line when Lou weighs a bribe) when it exists
  and is non-empty, else agents/odds/fixtures/ref_ledger.jsonl. HEEL_TURN_REF_LEDGER overrides the path.
  Line: {"ref": "lou", "match": "m2", "bribe_from": "silas", "accepted": true, "caught": false}

materialization:
  type: table
  strategy: create+replace

columns:
  - name: ref
    type: varchar
  - name: match
    type: varchar
  - name: bribe_from
    type: varchar
  - name: accepted
    type: boolean
  - name: caught
    type: boolean

@bruin """

import json
import os
from pathlib import Path

import pandas as pd

BRUIN = Path(__file__).resolve().parents[2]  # bruin/
FIELDS = ["ref", "match", "bribe_from", "accepted", "caught"]


def ledger_path():
    if os.environ.get("HEEL_TURN_REF_LEDGER"):
        return Path(os.environ["HEEL_TURN_REF_LEDGER"])
    live = BRUIN / "data" / "ref_ledger.jsonl"
    return live if live.exists() and live.stat().st_size > 0 else BRUIN.parent / "agents" / "odds" / "fixtures" / "ref_ledger.jsonl"


def materialize():
    rows = []
    for line in ledger_path().read_text().splitlines():
        if line.strip():
            e = json.loads(line)
            rows.append({f: e.get(f) for f in FIELDS})
    df = pd.DataFrame(rows, columns=FIELDS)
    for f in ("ref", "match", "bribe_from"):
        df[f] = df[f].astype("string").str.strip().str.lower()
    for f in ("accepted", "caught"):
        df[f] = df[f].astype("boolean")
    return df
