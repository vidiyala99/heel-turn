#!/usr/bin/env bash
# Plant one corrupt event and show the staging checks block every mart (UPSTREAM FAILED),
# then remove it and show the pipeline green again. bash bruin/prove_bad_row.sh
set -uo pipefail
cd "$(dirname "$0")"
live=data/events.jsonl
if [ -s "$live" ]; then echo "refusing: $live has live events; move it aside first"; exit 1; fi
mkdir -p data
cp fixtures/events.jsonl "$live"
# kind and situation outside the schema, an off-roster target, and a reused event_id
echo '{"event_id": "m1-0000", "match": "m1", "t_ms": 999999, "actor": "silas", "kind": "suplex", "target": "ghost", "situation": "on_fire", "success": true}' >> "$live"
echo "=== planted: $(tail -1 "$live")"
echo "=== bruin run with the bad row (expect FAIL + UPSTREAM FAILED)"
bash run.sh 2>&1 | sed -n '/^====/,$p'
echo "=== exit code: ${PIPESTATUS[0]}"
rm "$live"
q() { bruin query --config-file .bruin.yml --connection duckdb-default --query "$1" >/dev/null; }
echo "=== tamper the marts directly: a habit share of 1.5 and a relationship about 'ghost'; run checks only"
q "UPDATE marts.habits SET share = 1.5 WHERE player = 'p1' AND situation = 'opening' AND move = 'strike'"
q "INSERT INTO marts.relationships VALUES ('ghost', 'vex', 0.5, 0, NULL)"
for a in habits relationships; do
  bruin run --config-file .bruin.yml --only checks "assets/marts/$a.sql" 2>&1 | sed -n '/^====/,$p'
done
echo "=== bad row removed, bruin run again (expect green; rebuilds the tampered marts)"
bash run.sh 2>&1 | sed -n '/^====/,$p'
