/* @bruin
name: marts.ref_ledger
type: duckdb.sql
description: |
  How bribable the referee is, per briber and overall (briber = '_any'). take_rate is Laplace-smoothed
  (accepted + 1) / (offers + 2) so one envelope never reads as certainty; caught_rate likewise over the
  envelopes he took. The odds board and the "Will Lou take the envelope?" poll price off this row.

depends:
  - raw.ref_ledger
  - seeds.wrestlers

materialization:
  type: table

columns:
  - name: ref
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: briber
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: offers
    type: integer
    checks:
      - name: positive
  - name: accepted
    type: integer
    checks:
      - name: non_negative
  - name: take_rate
    type: double
    checks:
      - name: min
        value: 0
      - name: max
        value: 1
  - name: caught_rate
    type: double
    checks:
      - name: min
        value: 0
      - name: max
        value: 1

custom_checks:
  - name: only the referee takes envelopes, only fighters offer them
    query: |
      SELECT count(*) FROM marts.ref_ledger
      WHERE ref NOT IN (SELECT wrestler FROM seeds.wrestlers WHERE role = 'referee')
         OR (briber <> '_any' AND briber NOT IN (SELECT wrestler FROM seeds.wrestlers WHERE role IN ('human', 'ai')))
  - name: accepted never exceeds offers
    query: SELECT count(*) FROM marts.ref_ledger WHERE accepted > offers
@bruin */

WITH l AS (
    SELECT ref, bribe_from, coalesce(accepted, false) AS accepted, coalesce(caught, false) AS caught
    FROM raw.ref_ledger
    WHERE ref IS NOT NULL AND bribe_from IS NOT NULL
),
grouped AS (
    SELECT ref, bribe_from AS briber, count(*) AS offers,
           count(*) FILTER (WHERE accepted) AS accepted,
           count(*) FILTER (WHERE accepted AND caught) AS caught
    FROM l GROUP BY ref, bribe_from
    UNION ALL
    SELECT ref, '_any', count(*), count(*) FILTER (WHERE accepted), count(*) FILTER (WHERE accepted AND caught)
    FROM l GROUP BY ref
)
SELECT
    ref,
    briber,
    offers::INTEGER AS offers,
    accepted::INTEGER AS accepted,
    caught::INTEGER AS caught,
    (accepted + 1.0) / (offers + 2.0) AS take_rate,
    (caught + 1.0) / (accepted + 2.0) AS caught_rate
FROM grouped
