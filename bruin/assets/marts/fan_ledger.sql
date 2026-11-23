/* @bruin
name: marts.fan_ledger
type: duckdb.sql
description: |
  Every fan-points wager and what it paid (play money only: points have no cash value and cannot be
  bought). One row per bet from raw.bets. A bet settles when the service has written a result line for
  its (match, market): won -> payout = round(stake x decimal_odds locked at bet time), lost -> 0.
  Unsettled bets are status 'open' with payout 0.

depends:
  - raw.bets
  - staging.stg_events

materialization:
  type: table

columns:
  - name: bet_id
    type: varchar
    primary_key: true
    checks:
      - name: not_null
      - name: unique
  - name: fan_id
    type: varchar
    checks:
      - name: not_null
  - name: match
    type: varchar
    checks:
      - name: not_null
  - name: market
    type: varchar
    checks:
      - name: not_null
  - name: pick
    type: varchar
    checks:
      - name: not_null
  - name: stake
    type: bigint
    checks:
      - name: positive
  - name: decimal_odds
    type: double
    checks:
      - name: min
        value: 1
  - name: status
    type: varchar
    checks:
      - name: accepted_values
        value: [open, won, lost]
  - name: payout
    type: bigint
    checks:
      - name: non_negative

custom_checks:
  - name: no bet pays more than its locked odds
    query: SELECT count(*) FROM marts.fan_ledger WHERE payout > round(stake * decimal_odds)
  - name: one result per match and market
    query: |
      SELECT count(*) FROM (
        SELECT match, market FROM raw.bets WHERE type = 'result' GROUP BY 1, 2 HAVING count(DISTINCT outcome) > 1
      )
  - name: winner results agree with the match events
    description: |
      When the events show exactly one wrestler left standing, the winner market must have been settled
      on that wrestler. A disagreement means fans were paid on the wrong result.
    query: |
      WITH entered AS (SELECT DISTINCT match, actor AS w FROM staging.stg_events WHERE kind = 'entry'),
      out AS (SELECT DISTINCT match, target AS w FROM staging.stg_events WHERE kind = 'elimination'),
      standing AS (
        SELECT match, any_value(w) AS winner FROM entered e
        WHERE NOT EXISTS (SELECT 1 FROM out o WHERE o.match = e.match AND o.w = e.w)
        GROUP BY match HAVING count(*) = 1
      )
      SELECT count(*) FROM raw.bets r JOIN standing s USING (match)
      WHERE r.type = 'result' AND r.market = 'winner' AND r.outcome <> s.winner
@bruin */

WITH bets AS (
    SELECT bet_id, fan AS fan_id, match, market, pick, stake, decimal_odds, ts
    FROM raw.bets WHERE type = 'bet'
),
results AS (
    SELECT match, market, any_value(outcome) AS outcome FROM raw.bets WHERE type = 'result' GROUP BY 1, 2
)
SELECT
    b.bet_id,
    b.fan_id,
    b.match,
    b.market,
    b.pick,
    b.stake,
    b.decimal_odds,
    CASE WHEN r.outcome IS NULL THEN 'open' WHEN r.outcome = b.pick THEN 'won' ELSE 'lost' END AS status,
    (CASE WHEN r.outcome = b.pick THEN round(b.stake * b.decimal_odds) ELSE 0 END)::BIGINT AS payout,
    b.ts
FROM bets b
LEFT JOIN results r USING (match, market)
ORDER BY b.ts
