/* @bruin
name: marts.leaderboard
type: duckdb.sql
description: |
  Career table for the leaderboard screen. A win is a finished match (exactly one entrant left
  standing) that the wrestler entered and was never eliminated from. Unfinished matches are skipped.

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
      WITH ent AS (SELECT DISTINCT match, actor AS w FROM staging.stg_events WHERE kind = 'entry'),
           eli AS (SELECT DISTINCT match, target AS w FROM staging.stg_events WHERE kind = 'elimination'),
           fin AS (SELECT match FROM ent WHERE (match, w) NOT IN (SELECT (match, w) FROM eli)
                   GROUP BY match HAVING count(*) = 1)
      SELECT count(*) FROM (SELECT 1) WHERE (SELECT coalesce(sum(wins), 0) FROM marts.leaderboard) <> (SELECT count(*) FROM fin)
@bruin */

WITH entered AS (
    SELECT DISTINCT match, actor AS wrestler FROM staging.stg_events WHERE kind = 'entry'
),
eliminated AS (
    SELECT DISTINCT match, target AS wrestler FROM staging.stg_events WHERE kind = 'elimination'
),
standing AS (
    SELECT match, wrestler FROM entered
    WHERE (match, wrestler) NOT IN (SELECT (match, wrestler) FROM eliminated)
),
finished AS (  -- a match counts once exactly one entrant is left standing; abandoned live matches are skipped
    SELECT match FROM standing GROUP BY match HAVING count(*) = 1
),
wins AS (
    SELECT wrestler, count(*) AS wins
    FROM standing WHERE match IN (SELECT match FROM finished)
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
