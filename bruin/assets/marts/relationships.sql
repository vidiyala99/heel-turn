/* @bruin
name: marts.relationships
type: duckdb.sql
description: |
  How wrestler a feels about wrestler b (directed). trust starts at 0.5, +0.25 per accepted alliance
  between them, -0.5 per betrayal of a by b, -0.1 per refused offer; clamped to [0, 1].
  grudge = 2 x betrayals of a by b + eliminations of a by b. last_betrayal = match id of b's latest
  betrayal of a. A grudge row is what turns an ally into a betrayal (finish line item 4).

depends:
  - staging.stg_events
  - seeds.wrestlers

materialization:
  type: table

columns:
  - name: a
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: b
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: trust
    type: double
    checks:
      - name: min
        value: 0
      - name: max
        value: 1
  - name: grudge
    type: integer
    checks:
      - name: non_negative
  - name: last_betrayal
    type: varchar
    description: Match id of the latest betrayal of a by b, null if never.

custom_checks:
  - name: relationships only name known wrestlers
    description: A row about someone off the roster means memory is about a ghost.
    query: |
      SELECT count(*) FROM marts.relationships
      WHERE a NOT IN (SELECT wrestler FROM seeds.wrestlers WHERE role IN ('human', 'ai'))
         OR b NOT IN (SELECT wrestler FROM seeds.wrestlers WHERE role IN ('human', 'ai'))
@bruin */

WITH fighters AS (
    SELECT wrestler FROM seeds.wrestlers WHERE role IN ('human', 'ai')
),
pair_events AS (
    SELECT e.*
    FROM staging.stg_events e
    WHERE e.target IN (SELECT wrestler FROM fighters) AND e.actor IN (SELECT wrestler FROM fighters)
),
-- one row per directed (a = the one who feels, b = the one felt about)
directed AS (
    SELECT target AS a, actor AS b, kind, success, match, t_ms FROM pair_events
    UNION ALL
    -- an accepted alliance counts for both sides
    SELECT actor AS a, target AS b, kind, success, match, t_ms FROM pair_events WHERE kind = 'alliance_reply'
)
SELECT
    a,
    b,
    greatest(0.0, least(1.0,
        0.5
        + 0.25 * count(*) FILTER (WHERE kind = 'alliance_reply' AND success)
        - 0.5 * count(*) FILTER (WHERE kind = 'betray')
        - 0.1 * count(*) FILTER (WHERE kind = 'alliance_reply' AND NOT success)
    )) AS trust,
    (2 * count(*) FILTER (WHERE kind = 'betray') + count(*) FILTER (WHERE kind = 'elimination'))::INTEGER AS grudge,
    arg_max(match, (match, t_ms)) FILTER (WHERE kind = 'betray') AS last_betrayal
FROM directed
WHERE a <> b
GROUP BY a, b
