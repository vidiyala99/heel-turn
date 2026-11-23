# Round 4 brief: pick ONE direction (judge, independently)

Goal (Aakash): win the hackathon and as many sponsor prizes as possible with a game that is creative, fun, unique and
pushes the sponsor tools to their limits (not another AI wrapper). Pick one of his two directions.

## The two directions (both original games, no copied IP)
- **A. Hero tactical shooter:** multiplayer, attack/defend with a bomb to plant and defuse, each agent hero has its own
  abilities, traps and personality, a leaderboard, agents interact with each other. Humans join by link; AI heroes
  fill the teams. The point is to show AI agents learn strategies.
- **B. Wrestling:** tag team matches and a Royal Rumble, wrestlers with personalities who taunt, live commentators,
  round style, alliances. Humans join by link; AI wrestlers fill the roster. The point is the same: show agents learn.

## Constraints
Solo builder, Windows laptop, browser game (desktop only), about 5.5 h of hacking (11:30-13:00, 14:00-18:00), all code
written at the event. AI model calls take about 1 s (OpenAI key), so models cannot aim or react frame by frame.

## Read (grounding; read only these)
- `prep/sponsors.md` (sponsor tools, prizes, event must-haves, track rules, BAND "delete test")
- `prep/event-site.md` (judging form, must-haves, demo advice)
- `prep/stack-survey.md` (libraries and assets available)
- `prep/attention-teardown.md` (what spreads)
- `docs/GROUNDING.md` (hard exclusions, Bruin facts)
Do NOT read anything else under `docs/` (other files hold earlier opinions that would anchor you).

## Rubric (score each direction 1-10 per row, cite the file and line behind each score)
| # | Criterion | Weight |
|---|---|---|
| G1 | Hard exclusions pass (GROUNDING.md) | gate |
| G2 | Track 2 must-haves provable, including "agents can ally/trade/betray" and "one major world event caused by agents alone" | gate |
| 1 | Bruin is essential and pushed toward its limit (pipelines, checks, lineage, inference assets, agent memory) | 25 |
| 2 | BAND passes the delete test with 2+ signals and ends on a human approve/block | 20 |
| 3 | Other sponsors (Runware, Telem, Glasser, Lingcode, AdaL) used for real, not bolted on | 10 |
| 4 | Originality vs the room; passes the "remove the AI" test (the model does what only a model can) | 15 |
| 5 | Judge form: Presentation, Execution, Innovation, Impact, Implementation | 10 |
| 6 | Fun to play and to watch; attention potential | 10 |
| 7 | Solo buildability in 5.5 h, with what to cut first | 10 |

## Output
Write `docs/arena/round4-direction/judge-<your label>.md`: gate results, a score table with weighted totals, the
2-3 facts that decide it, your pick, the strongest argument for the direction you did not pick, and anything in
the grounding you found wrong or missing. Be blunt. Under 500 words.
