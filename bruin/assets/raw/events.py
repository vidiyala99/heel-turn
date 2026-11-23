""" @bruin

name: raw.events
type: python
image: python:3.11
connection: duckdb-default
description: |
  Raw match events, one row per line of the events file. Reads bruin/data/events.jsonl (the live game
  appends there) when it exists and is non-empty, else bruin/fixtures/events.jsonl. HEEL_TURN_EVENTS
  overrides the path. Parsing is loose on purpose: stg_events checks the values.

materialization:
  type: table
  strategy: create+replace

columns:
  - name: event_id
    type: varchar
    description: From the event when present, else md5 of match|t_ms|actor|kind|target.
  - name: match
    type: varchar
  - name: t_ms
    type: bigint
  - name: actor
    type: varchar
  - name: kind
    type: varchar
  - name: target
    type: varchar
  - name: situation
    type: varchar
  - name: success
    type: boolean
  - name: text
    type: varchar
  - name: source_file
    type: varchar

@bruin """

import hashlib
import json
import os
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]  # bruin/
FIELDS = ["event_id", "match", "t_ms", "actor", "kind", "target", "situation", "success", "text"]


def events_path():
    if os.environ.get("HEEL_TURN_EVENTS"):
        return Path(os.environ["HEEL_TURN_EVENTS"])
    live = ROOT / "data" / "events.jsonl"
    return live if live.exists() and live.stat().st_size > 0 else ROOT / "fixtures" / "events.jsonl"


def materialize():
    path = events_path()
    rows = []
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        e = json.loads(line)
        row = {f: e.get(f) for f in FIELDS}
        if not row["event_id"]:
            key = "|".join(str(e.get(k)) for k in ("match", "t_ms", "actor", "kind", "target"))
            row["event_id"] = hashlib.md5(key.encode()).hexdigest()
        row["source_file"] = str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)
        rows.append(row)
    df = pd.DataFrame(rows, columns=FIELDS + ["source_file"])
    df["t_ms"] = pd.to_numeric(df["t_ms"], errors="coerce").astype("Int64")
    df["success"] = df["success"].astype("boolean")
    return df
