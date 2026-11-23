/* @bruin
name: staging.stg_events
type: duckdb.sql
description: Typed, checked match events. Every mart reads this, so a bad row here blocks the memory refresh.

depends:
  - raw.events
  - seeds.wrestlers

materialization:
  type: table

columns:
  - name: event_id
    type: varchar
    primary_key: true
    checks:
      - name: not_null
      - name: unique
  - name: match
    type: varchar
    checks:
      - name: not_null
  - name: t_ms
    type: bigint
    checks:
      - name: not_null
      - name: non_negative
  - name: actor
    type: varchar
    checks:
      - name: not_null
  - name: kind
    type: varchar
    checks:
      - name: not_null
      - name: accepted_values
        value: [strike, grapple, block, reversal, knockdown, pin, kickout, elimination, entry, taunt,
                alliance_offer, alliance_reply, betray, plan, commentary]
  - name: situation
    type: varchar
    checks:
      - name: not_null
      - name: accepted_values
        value: [opening, after_block, low_stamina, cornered]
  - name: is_move
    type: boolean
    description: True for the fight-triangle moves (strike, grapple, block).

custom_checks:
  - name: every actor is on the roster
    description: An actor or target that is not in seeds.wrestlers means a typo or a corrupt event.
    query: |
      SELECT count(*) FROM staging.stg_events e
      WHERE e.actor NOT IN (SELECT wrestler FROM seeds.wrestlers)
         OR (e.target IS NOT NULL AND e.target NOT IN (SELECT wrestler FROM seeds.wrestlers))
@bruin */

SELECT
    event_id,
    match,
    t_ms,
    lower(trim(actor)) AS actor,
    lower(trim(kind)) AS kind,
    nullif(lower(trim(target)), '') AS target,
    lower(trim(situation)) AS situation,
    success,
    text,
    lower(trim(kind)) IN ('strike', 'grapple', 'block') AS is_move,
    source_file
FROM raw.events
