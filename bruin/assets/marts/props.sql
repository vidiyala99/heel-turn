/* @bruin
name: marts.props
type: duckdb.sql
description: |
  Prior probabilities for the spectator prop polls, per card (same cards as marts.odds).
    envelope    P(Lou takes the envelope)        = ref_ledger take_rate for lou, briber '_any' (0.5 with no history)
    turn_<w>    P(w turns on a partner)          = (betrayals + 0.5) / (matches + 2)                 -- leaderboard
                                                   x (1 + 0.5 x (1 - mean trust w holds in card-mates)) -- relationships
                                                   capped at 0.95
    heel_turn   P(anyone on the card turns)      = 1 - prod(1 - turn_w)
    kipup       P(a downed wrestler kips up)     = (kickouts + 1) / (kickouts + pins + 2)          -- stg_events

depends:
  - staging.stg_events
  - marts.odds
  - marts.leaderboard
  - marts.relationships
  - marts.ref_ledger

materialization:
  type: table

columns:
  - name: match_id
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: prop
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: prob
    type: double
    checks:
      - name: not_null
      - name: min
        value: 0
      - name: max
        value: 1

custom_checks:
  - name: every card prices the three headline polls
    query: |
      SELECT count(*) FROM (SELECT DISTINCT match_id FROM marts.odds) c
      WHERE (SELECT count(*) FROM marts.props p
             WHERE p.match_id = c.match_id AND p.prop IN ('envelope', 'heel_turn', 'kipup')) <> 3
@bruin */

WITH cards AS (
    SELECT match_id, wrestler FROM marts.odds
),
played AS (
    SELECT actor AS wrestler, count(DISTINCT match) AS matches
    FROM staging.stg_events WHERE kind = 'entry' GROUP BY 1
),
mate_trust AS (
    SELECT c.match_id, c.wrestler, avg(r.trust) AS trust
    FROM cards c
    JOIN cards m ON m.match_id = c.match_id AND m.wrestler <> c.wrestler
    LEFT JOIN marts.relationships r ON r.a = c.wrestler AND r.b = m.wrestler
    GROUP BY 1, 2
),
turns AS (
    SELECT
        c.match_id,
        c.wrestler,
        least(0.95,
            (coalesce(l.betrayals, 0) + 0.5) / (coalesce(p.matches, 0) + 2.0)
            * (1 + 0.5 * (1 - coalesce(t.trust, 0.5)))) AS prob
    FROM cards c
    LEFT JOIN marts.leaderboard l USING (wrestler)
    LEFT JOIN played p USING (wrestler)
    LEFT JOIN mate_trust t USING (match_id, wrestler)
),
envelope AS (
    SELECT coalesce((SELECT take_rate FROM marts.ref_ledger WHERE ref = 'lou' AND briber = '_any'), 0.5) AS prob
),
kip AS (
    SELECT (count(*) FILTER (WHERE kind = 'kickout') + 1.0)
           / (count(*) FILTER (WHERE kind IN ('kickout', 'pin')) + 2.0) AS prob
    FROM staging.stg_events
)
SELECT match_id, 'turn_' || wrestler AS prop, prob FROM turns
UNION ALL
SELECT match_id, 'heel_turn', 1 - exp(sum(ln(1 - prob))) FROM turns GROUP BY match_id
UNION ALL
SELECT DISTINCT match_id, 'envelope', (SELECT prob FROM envelope) FROM cards
UNION ALL
SELECT DISTINCT match_id, 'kipup', (SELECT prob FROM kip) FROM cards
