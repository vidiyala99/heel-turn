/* @bruin
name: marts.counter_rate
type: duckdb.sql
description: |
  The declared learning metric. For each human move aimed at an AI wrestler, take that AI's next
  move back at the human within 3 s; it counts as a counter when it beats the human move
  (block beats strike, strike beats grapple, grapple beats block). counter_rate = countered / human_moves.

depends:
  - staging.stg_events
  - seeds.wrestlers

materialization:
  type: table

columns:
  - name: match
    type: varchar
    primary_key: true
  - name: human
    type: varchar
    primary_key: true
  - name: human_moves
    type: integer
    checks:
      - name: positive
  - name: countered
    type: integer
    checks:
      - name: non_negative
  - name: counter_rate
    type: double
    checks:
      - name: min
        value: 0
      - name: max
        value: 1
@bruin */

WITH moves AS (
    SELECT * FROM staging.stg_events WHERE is_move
),
human_moves AS (
    SELECT m.*
    FROM moves m
    JOIN seeds.wrestlers h ON h.wrestler = m.actor AND h.role = 'human'
    JOIN seeds.wrestlers t ON t.wrestler = m.target AND t.role = 'ai'
),
answered AS (
    SELECT h.match, h.actor AS human, h.kind AS human_move, r.kind AS reply, r.t_ms - h.t_ms AS gap_ms
    FROM human_moves h
    ASOF LEFT JOIN moves r
        ON r.match = h.match AND r.actor = h.target AND r.target = h.actor AND r.t_ms > h.t_ms
)
SELECT
    match,
    human,
    count(*)::INTEGER AS human_moves,
    count(*) FILTER (WHERE gap_ms <= 3000 AND reply = CASE human_move
        WHEN 'strike' THEN 'block' WHEN 'grapple' THEN 'strike' WHEN 'block' THEN 'grapple' END)::INTEGER AS countered,
    countered / human_moves AS counter_rate
FROM answered
GROUP BY match, human
ORDER BY match, human
