# Judge verdict (read-only arena judge)

A = candidate-1 "Mary Celeste Inquiry", B = candidate-2 "Last Pod", C = PLAN.md "Takes" (Idea + Phase B)

| # | Criterion | A | B | C |
|---|---|---|---|---|
| 1 | Bruin depth | 5 | 4 | 3 |
| 2 | Sponsor reach | 5 | 3 | 3 |
| 3 | Brief coverage | 4 | 5 | 3 |
| 4 | Buildability | 3 | 4 | 3 |
| 5 | Demo risk | 4 | 5 | 4 |
| 6 | Judge delight | 5 | 4 | 2 |
| | **Total /30** | **26** | **25** | **18** |

## Justifications
1. Bruin: A's `mart_admissible` computes `quote_found` and a custom check "no admitted exhibit lacks a verified quote", and the Judge's prompt contains only `bruin query` metric output, so Bruin decides the verdict. B uses Bruin for rules (`seats taken <= 3`), world state and memory marts, which is load-bearing but reads like game rules that Python could enforce. C is "raw events -> checked decisions -> agent_memory"; the checks gate nothing, so it is close to logger plus memory.
2. Reach: A makes Telem the only source of facts (no fetch, no source_id, inadmissible) with the trace id on each exhibit card, strong BAND use, Runware TTS plus portraits plus GLB, AdaL. B's Telem is "one call per scene; a tool, not the core mechanic" and its BAND is weakened by "engine ... picks speakers". C's Telem only sets an opening headline ("Telem to a fixed headline" is on its cut list) and the cast is undefined.
3. Coverage: B has the most on-screen movement and spectacle (deck tilting with flooding, pod launch, 5 characters with goals, Sequel-mode memory, histogram, voices, 3D). A covers every element but a courtroom is talky ("walk to marks": podium, board, stand). C lists the elements but leaves cast and goals as "Aakash's taste call", and memory comes last (16:15).
4. Buildability: B has the safest order (scripted dummy agents at 12:30 before LLMs, replay film) and a cut list. A packs six BAND agents, live web research, Bruin gating, 3D, TTS and 5 background takes into one afternoon, with the stage in a 75-minute slot; verbatim-quote discipline from the LLM is a hidden risk. C is simple but its cast is unspecified and "free rigged glTF" retargeting on Windows is unbudgeted.
5. Demo risk: B "recorded film replays ... cached TTS, so the cut is deterministic and cannot fail live". A has a recorded take as fallback but also wants a live 4-minute take depending on web fetches. C's Telem headline opens each take from live data, so it can surprise.
6. Delight: "hallucinations get caught on screen" is understood in 5 seconds by VCs and Bruin founders, and the unsolved-mystery framing is memorable. B is vivid but "agents betray each other over a lifeboat" is the trope most teams will pick. C's heist crew with a traitor is the most generic.

## Factual and optics flags
- A: states `bruin query --semantic-model inquiry --metric theory_support` as fact in the sponsor table; sponsors.md says the flag shape is UNVERIFIED (A's build step 1 does include a SQL fallback). Telem "trace id" returned in the response and per-character Runware voice selection are also unverified (A and B both assume them; browser TTS is the fallback).
- B: "engine ... picks speakers" is the "own orchestrator calling agents in turn" that sponsors.md says BAND's meaningful-use test does NOT count. Bruin checks run after the row is materialized, so "failed check = action rejected" needs an explicit reject-and-redecide loop, plus DuckDB file-lock care if the engine and `bruin run` touch the same file.
- C: no tool-fact errors found, but it is the least specified on BAND turn control (unit 1 never says who chooses the next speaker).
- Optics: A is the safest (1872, no living people); the verdict could "accuse" the real historical captain, which is acceptable if framed as a competing theory. B is morbid (leaving people to drown) but fictional. C's "heist crew" plus a live real-world headline as the opening event risks crime-planning optics and dragging a real tragedy or person into the plot.

## Recommendation
**Base: A (Mary Celeste Inquiry).** It wins the biggest pots on depth: Bruin gating (the $1000), Telem as sole fact source (a real top-3 shot), and BAND used the way the hacker guide's delete-test wants (Judge picks the next speaker at runtime, Clerk veto, hidden side-room, code only observes). Its weaknesses are movement and build load, which B fixes.

## Graft into A
1. From B: motion and spectacle. Give the courtroom physical beats (ship deck tilting or lurching as the verdict nears, characters crossing to the evidence board and the stand, a finale beat) so the 3D film is not a talking-heads court.
2. From B: build safety. Add B's step "engine with scripted dummy agents" (a deterministic fixture take) before LLM agents, and make the recorded replay with cached TTS the primary demo, with the live take as a bonus.
3. From B: the 8-run endings histogram and a within-run trust/grudge row in `mart_agent_credibility`, so memory visibly changes decisions inside one take as well as across takes.
4. From C: put `memory_refs` in the event schema (events cite the Bruin rows that influenced them), the 9:30-11:30 sponsor-demo questions (unit 0: prize criteria, credits), and use free rigged glTF characters only if the capsule-plus-portrait approach looks too weak by 15:00.
