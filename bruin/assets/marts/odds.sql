/* @bruin
name: marts.odds
type: duckdb.sql
description: |
  Fan-points odds board (play money only). One row per wrestler on each card: every match in
  stg_events (entrants = entry events) plus match_id 'next', the full roster, for the pre-show.
  rating = (1 + wins + 0.5 x eliminations + 0.25 x betrayals)            -- leaderboard
         x (1.2 - 0.4 x predictability)  -- habits: mean top-move share per situation; readable = counterable
         / (1 + 0.1 x heat)               -- relationships: grudge points card-mates hold against him
         x (1 + 0.5 x take_rate)          -- ref_ledger: only for wrestlers who have handed Lou an envelope
  win_prob = rating / sum(rating) over the card. line = American moneyline, decimal_odds = 1 / win_prob.

depends:
  - staging.stg_events
  - seeds.wrestlers
  - marts.leaderboard
  - marts.habits
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
  - name: wrestler
    type: varchar
    primary_key: true
    checks:
      - name: not_null
  - name: win_prob
    type: double
    checks:
      - name: not_null
      - name: min
        value: 0
      - name: max
        value: 1
  - name: line
    type: integer
    description: American moneyline. -150 = stake 150 to win 100; +300 = stake 100 to win 300.
    checks:
      - name: not_null
  - name: decimal_odds
    type: double
    description: Fan points returned per point staked on a win (stake included).
    checks:
      - name: min
        value: 1
  - name: rating
    type: double
    checks:
      - name: positive
  - name: predictability
    type: double
  - name: heat
    type: integer
    checks:
      - name: non_negative
  - name: ref_edge
    type: double
    checks:
      - name: min
        value: 0
      - name: max
        value: 1

custom_checks:
  - name: win probabilities sum to 1 per match
    description: A card whose probabilities do not sum to 1 pays out more (or less) fan points than it takes in.
    query: |
      SELECT count(*) FROM (SELECT match_id, sum(win_prob) AS s FROM marts.odds GROUP BY 1)
      WHERE abs(s - 1) > 1e-9
  - name: the likelier wrestler never pays more
    description: Within a card, a higher win_prob must never come with longer decimal_odds.
    query: |
      SELECT count(*) FROM marts.odds a JOIN marts.odds b USING (match_id)
      WHERE a.win_prob > b.win_prob + 1e-9 AND a.decimal_odds > b.decimal_odds
  - name: every card has at least two wrestlers
    query: SELECT count(*) FROM (SELECT match_id FROM marts.odds GROUP BY 1 HAVING count(*) < 2)
@bruin */

WITH fighters AS (
    SELECT wrestler FROM seeds.wrestlers WHERE role IN ('human', 'ai')
),
cards AS (
    SELECT DISTINCT match AS match_id, actor AS wrestler
    FROM staging.stg_events
    WHERE kind = 'entry' AND actor IN (SELECT wrestler FROM fighters)
    UNION ALL
    SELECT 'next', wrestler FROM fighters
),
predict AS (
    SELECT player AS wrestler, avg(top) AS predictability
    FROM (SELECT player, situation, max(share) AS top FROM marts.habits GROUP BY 1, 2)
    GROUP BY 1
),
mate_grudge AS (
    SELECT c.match_id, c.wrestler, r.grudge
    FROM cards c
    JOIN cards m ON m.match_id = c.match_id AND m.wrestler <> c.wrestler
    JOIN marts.relationships r ON r.b = c.wrestler AND r.a = m.wrestler
),
heat AS (
    SELECT c.match_id, c.wrestler, coalesce(sum(g.grudge), 0)::INTEGER AS heat
    FROM cards c
    LEFT JOIN mate_grudge g USING (match_id, wrestler)
    GROUP BY 1, 2
),
edge AS (
    SELECT briber AS wrestler, take_rate AS ref_edge
    FROM marts.ref_ledger WHERE ref = 'lou' AND briber <> '_any'
),
rated AS (
    SELECT
        c.match_id,
        c.wrestler,
        coalesce(p.predictability, 0.5) AS predictability,
        h.heat,
        coalesce(e.ref_edge, 0.0) AS ref_edge,
        (1 + coalesce(l.wins, 0) + 0.5 * coalesce(l.eliminations, 0) + 0.25 * coalesce(l.betrayals, 0))
          * (1.2 - 0.4 * coalesce(p.predictability, 0.5))
          / (1 + 0.1 * h.heat)
          * (1 + 0.5 * coalesce(e.ref_edge, 0.0)) AS rating
    FROM cards c
    JOIN heat h USING (match_id, wrestler)
    LEFT JOIN marts.leaderboard l USING (wrestler)
    LEFT JOIN predict p USING (wrestler)
    LEFT JOIN edge e USING (wrestler)
),
probs AS (
    SELECT *, rating / sum(rating) OVER (PARTITION BY match_id) AS win_prob FROM rated
)
SELECT
    match_id,
    wrestler,
    win_prob,
    (CASE WHEN win_prob >= 0.5
          THEN -round(100 * least(win_prob, 0.99) / (1 - least(win_prob, 0.99)))
          ELSE round(100 * (1 - win_prob) / win_prob) END)::INTEGER AS line,
    round(1 / win_prob, 2) AS decimal_odds,
    rating,
    predictability,
    heat,
    ref_edge
FROM probs
ORDER BY match_id, win_prob DESC
