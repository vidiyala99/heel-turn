/* @bruin
name: marts.leaderboard
type: duckdb.sql
description: |
  Career table for the leaderboard screen. A win is a match the wrestler entered and was never
  eliminated from (last one standing).

depends:
  - staging.stg_events
  - seeds.wrestlers

materialization:
  type: table

columns:
  - name: wrestler
    type: varchar
    primary_key: true
    checks:
      - name: not_null
      - name: unique
  - name: wins
    type: integer
    checks:
      - name: non_negative
  - name: eliminations
    type: integer
    checks:
      - name: non_negative
  - name: betrayals
    type: integer
    checks:
      - name: non_negative

custom_checks:
  - name: one winner per match
    query: |
      SELECT count(*) FROM (SELECT DISTINCT match FROM staging.stg_events)
      WHERE (SELECT sum(wins) FROM marts.leaderboard) <> (SELECT count(DISTINCT match) FROM staging.stg_events)
@bruin */

WITH entered AS (
    SELECT DISTINCT match, actor AS wrestler FROM staging.stg_events WHERE kind = 'entry'
),
eliminated AS (
    SELECT DISTINCT match, target AS wrestler FROM staging.stg_events WHERE kind = 'elimination'
),
wins AS (
    SELECT wrestler, count(*) AS wins
    FROM entered
    WHERE (match, wrestler) NOT IN (SELECT (match, wrestler) FROM eliminated)
    GROUP BY wrestler
)
SELECT
    w.wrestler,
    coalesce(wins.wins, 0)::INTEGER AS wins,
    (SELECT count(*) FROM staging.stg_events e WHERE e.kind = 'elimination' AND e.actor = w.wrestler)::INTEGER AS eliminations,
    (SELECT count(*) FROM staging.stg_events e WHERE e.kind = 'betray' AND e.actor = w.wrestler)::INTEGER AS betrayals
FROM seeds.wrestlers w
LEFT JOIN wins ON wins.wrestler = w.wrestler
WHERE w.role IN ('human', 'ai')
ORDER BY wins DESC, eliminations DESC
