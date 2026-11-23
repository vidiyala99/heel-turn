/* @bruin
name: marts.habits
type: duckdb.sql
description: |
  What each wrestler does in each situation. AI wrestlers read the human rows before every plan:
  share = n / all moves by that player in that situation.

depends:
  - staging.stg_events

materialization:
  type: table

columns:
  - name: player
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: situation
    type: varchar
    primary_key: true
    checks:
      - name: accepted_values
        value: [opening, after_block, low_stamina, cornered]
  - name: move
    type: varchar
    primary_key: true
    checks:
      - name: accepted_values
        value: [strike, grapple, block]
  - name: n
    type: integer
    checks:
      - name: positive
  - name: share
    type: double
    checks:
      - name: positive

custom_checks:
  - name: habit share is a proportion
    description: A share above 1 means the denominator is wrong and every counter plan built on it is wrong.
    query: SELECT count(*) FROM marts.habits WHERE share > 1 OR share <= 0
  - name: shares sum to 1 per player and situation
    query: |
      SELECT count(*) FROM (
        SELECT player, situation, sum(share) AS s FROM marts.habits GROUP BY 1, 2
      ) WHERE abs(s - 1) > 1e-9
@bruin */

SELECT
    actor AS player,
    situation,
    kind AS move,
    count(*) AS n,
    count(*) / sum(count(*)) OVER (PARTITION BY actor, situation) AS share
FROM staging.stg_events
WHERE is_move
GROUP BY actor, situation, kind
