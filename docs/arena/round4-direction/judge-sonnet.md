# Judge: sonnet. Pick: B (Wrestling)

## Gates
- G1 hard exclusions (GROUNDING.md:33-40): A PASS (original heroes; plant/defuse is a genre mechanic, not a named game, but keep names and maps clearly original). B PASS (no listed recipe, no job angle).
- G2 Track 2 must-haves (event-site.md:39): A PARTIAL. Teams are fixed, so "ally/trade/betray" is forced in (only an economy buy phase or a defecting bot). "Event caused by agents alone" is thin (a bot plant is not a world event). B PASS. Royal Rumble alliances, tag-partner betrayal and a run-in that decides a title are native, and agents can cause them with no human present.

## Scores (1-10, weight)
| Row | W | A | B | Cite |
|---|---|---|---|---|
| 1 Bruin | 25 | 7 | 7 | sponsors.md:50-53. A has richer numbers (economy, site win rates, learned strategy). B has grudge/alliance memory marts and an `inference` asset for heat and promo scoring (GROUNDING.md:43-48). |
| 2 BAND | 20 | 6 | 8 | sponsors.md:64. A's team callouts are a real mention-scoped boundary, but AI calls are an orchestrator in turns. B has private alliance rooms, a booker agent with veto, commentators as dependent handoff, and a human who approves or blocks a finish. |
| 3 Others | 10 | 6 | 7 | Runware voices and portraits and Telem/Glasser lookups fit both. Wrestler gimmicks, promos and TTS use Runware more naturally. |
| 4 Originality / remove-AI | 15 | 4 | 8 | stack-survey.md:78 says the LLM only emits intents above scripted bots. Delete it and A still plays. In B the model writes the taunts, deals, commentary and betrayals, which is what only a model can do. |
| 5 Judge form | 10 | 6 | 7 | event-site.md:56. A looks like Execution on shooter netcode. B shows Innovation and Presentation. |
| 6 Fun / attention | 10 | 7 | 8 | attention-teardown.md:51. What spreads is betrayal, lying and "AI did something unhinged", which is B's core loop. A is a bots-in-a-shooter clip. |
| 7 Buildability | 10 | 3 | 7 | stack-survey.md:147-153 lists three prototype-first risks for A: navmesh bots, netcode and lag-comp, rigged heroes. B is turn-based or slow-tick, so 1 s model latency fits and most of the time goes to content. |

Weighted (out of 100): **A 57.0, B 74.5**.

## The facts that decide it
1. 1 s model latency (brief) means A's agents never aim or react. The "AI" is a thin strategist over scripted bots, so it fails the remove-the-AI test. B's loop is slow by design.
2. G2 betrayal and agent-caused events are native to wrestling and bolted on to attack/defend.
3. Solo, 5.5 h, not a gamer (GROUNDING.md:19): A's own stack survey lists three project-killing risks. B's riskiest piece is only presentation (ring, models, camera).

## Strongest case for A
"Agents learn strategies" is measurable. A produces numbers (site win rates, economy, kill trades) that Bruin can check and chart, and learning shows on a scoreboard. Wrestling outcomes are booked theatre, so judges may ask what the agents actually learned. A tactical shooter also reads as serious engineering. Counter: B must make memory change a visible decision (a grudge turns an ally into a run-in), and log the reason each time.

## Grounding wrong or missing
- stack-survey.md is shooter-only. There is no wrestling stack, so B needs a quick pick (three.js or 2D sprites, one Node loop).
- Colyseus demos are private (stack-survey.md:13). Do not count on them.
- Bruin judging criteria are unknown (GROUNDING.md:28). Ask at the 10:30 demo.
- Lingcode is a $200 prize (sponsors.md:15) but is marked skip with no plan.
- event-site.md:39 needs 2+ humans simultaneously. Neither direction plans a solo-demo fallback.
- Attention data (attention-teardown.md) covers AI social-deduction games, not shooters or wrestling. It supports "betrayal", not either genre directly.
