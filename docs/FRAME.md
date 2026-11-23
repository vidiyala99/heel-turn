# Frame: hero tactical shooter (pstack figure-it-out, Phase A, 2026-11-23 00:25)

Aakash's direction: an original game in the Valorant genre (5v5-style attack/defend, heroes with personalities and
abilities, good graphics), friends can join by link, and the point is to check whether the AI agents actually learn
strategies. Not a recreation of Valorant: original heroes, names, art, map.

## Goal as a finish line (falsifiable, checked at 17:30)
1. **Playable:** a stranger opens a link on their own device and plays a round with Aakash and AI heroes, in a 3D
   (angled top-down) scene, with no setup.
2. **Must-haves visible:** 3+ AI heroes with distinct look, role and personality; they move and fight on screen; a decision
   log shows each strategic call and why.
3. **Learning proven, not claimed:** a chart of a pre-declared metric (e.g. AI defenders guessing the attackers' target
   site, or AI round win rate vs the human team) across rounds, next to the same heroes with memory off. Many headless
   bot-vs-bot rounds for the curve; live human rounds to show it. If the two curves overlap, we say so.
4. **Sponsors essential:** BAND console shows 2+ delete-test signals and a human approve/block; Bruin pipeline turns round
   events into the habit tables the heroes read, with checks green and lineage shown.
5. **Shipped:** public repo with a "Bruin Features Used" README section, a 1-3 min AdaL video, submitted by 17:30.

## Premises to test (attack the premise)
- P1 **AI models cannot aim in real time** (about 1 s per call vs millisecond reactions). Known false-premise, so the design
  splits: simple fast bots move and shoot; AI heroes decide strategy between rounds and every few seconds. Test: unit 1.
- P2 **Learning shows up within the event's round count.** Unknown. Test: headless bot-vs-bot rounds by 15:00; if no gap
  vs memory-off, reframe the claim honestly.
- P3 **Two browsers in one live match is buildable in about an hour.** Unknown. Riskiest unit, goes first.
- P4 **Free low-poly asset packs look good enough.** Unknown. Prototype the scene early and screenshot it.

## Scope and rigor
Solo, 5.5 h. Rigor high on the five finish-line items (any miss sinks it), low on everything else.
One map, one mode (plant/defend), 2 humans + 3-4 AI heroes, 4-6 heroes total, 2 abilities each at most.

## Is it a winning pick? (scored against docs/RUBRIC.md; "builder's edge" set aside per 00:09 discussion)
| Criterion | Verdict | Evidence |
|---|---|---|
| Exclusions | PASS | Not a recipe, not a brief example, not social deduction, not job seeking |
| Track 2 must-haves | PASS if P3 holds | 2+ humans, 3+ agents, agents act alone (agent-called retake = world event) |
| Bruin essential | STRONG | Round events -> habit tables heroes read -> learning curve; game analytics is Bruin's home turf (its blog) |
| BAND delete test | STRONG | Team rooms the other side cannot see (boundary); support vetoes the caller (blockable verdict); scout finding answered by caller (handoff); human captain approves |
| Originality vs the room | GOOD, not novel | "LLMs play strategy games" exists (agent-command 3D RTS, LLM Skirmish, Heroes 3 posts); a hero shooter with AI teammates that learn your habits, with proof, is rare and absent from every recipe |
| Judge form | GOOD | Innovation + Presentation high if it looks good; Impact story needs work (e.g. adaptive game AI / playtesting) |
| Fun + attention | HIGHEST | Shooters are popular; "AI teammates that learn your playstyle, join here" invites play; Aakash likes the genre |
| Buildability | HARDEST of all options | Live multiplayer + 3D + bots + AI layer + learning loop, solo |
| Other sponsors | Runware voices fit; Telem, Glasser skip | Bolt-ons would not count |

**Verdict:** a strong pick on every scoring axis except buildability, which decides whether it wins at all.
It wins only if the build is ruthlessly scoped and the riskiest units are proven first. 15:00 fallback: bots vs bots plus
one human, recorded, with the learning chart; still meets every must-have except the second live human.
