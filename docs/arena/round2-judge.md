# Round 2 judge: A (TAKE 37) vs B (BAD CREDIT) vs C (Continuity)

Scores 1-5. Grounded in prep/event-site.md, sponsor-signals.md, winner-signals.md, wins-scraped.md, sponsors.md.

| Criterion | A | B | C |
|---|---|---|---|
| 1 Uniqueness / not wrapper / avoids clichés | 4 "checks enforce internal canon, not external truth; no fact-checking"; still check-shaped, so adjacent to the Telem verification family | 4 "audit of agents' own behaviour (said vs did)", credit bureau for agent commerce; nothing like it in the SearchHack gallery | 4 "dbt for fiction" is a sharp idea, but the text is a pitch with no loop |
| 2 Fun / delight after 30 demos | 4 divas, "CUT!" on a red check, blooper reel, lip-synced best take | 5 two humans trade with grudge-holding merchants, Vex calls in every loan, Mint Inspector raid | 3 "CONTINUITY ERROR" rejects are funny once; no staging described |
| 3 Sponsor limit-push (Bruin + visible prizes) | 5 Bruin: raw/stg/custom SQL checks/inference asset/mart memory feeding the next take; BAND 4 agents + green room + veto; Runware directed TTS + Avatar 6; Telem secondary; AdaL | 5 Bruin: inference `intent` + conservation check + 3 marts driving rates and prompts; BAND, Runware, Glasser ledger, Telem "Wire", AdaL. Widest prize spread, but Glasser/Telem are thin | 3 Bruin idea is strong but unspecified; Telem headline is a bolt-on; multi-model BAND is a good pitch with no plan |
| 4 Judge-form fit (Pres/Exec/Innov/Impact/Impl) | 4 Presentation and Impl strong (replay, numbers); Impact "canon layer / evals-as-a-pipeline for narrative agents" is plausible but niche | 5 Impact is the most investable: "Experian for the agent economy"; Innovation high; Presentation depends on live play | 2 no Impact story, no build, no numbers; Execution unscorable |
| 5 Must-haves + boosters + "run it twice" | 5 all five musts, 3D + memory + voice, Film musts met (final 1-3 min short), takes 1/4/8 are the run-twice proof with a measured chart | 4 Game musts met (2 humans, 3+ agents, agent-caused event); run-twice via cross-run memory, but ablation is stretch | 2 no decision log, no 3D, no visuals, no measured loop mentioned |
| 6 Solo 5.5 h on Windows, honest cut list | 3 big stack (BAND x4, Bruin, 3D, TTS, avatar) but riskiest-first order and a real cut list | 2 FastAPI + websocket, 4 agent processes, 2 browser tabs, human proxy, per-round `bruin run`, 3D, voice, lip-sync | 2 no build order, no cut list, multi-model key setup |
| 7 Demo risk | 4 pre-run batch + replay decouples latency; cached TTS; no second human | 2 live, per-round Bruin latency, needs a second human ("do not fake") | 3 undefined |
| **Total /35** | **29** | **27** | **18** |

## Convergence of A and C
It strengthens the concept as a signal (the mechanic fits Bruin's checks, BAND's rooms and the Film musts), but it does not add uniqueness, and other solo builders may land on it too, so execution decides. A executes it better: concrete beat schema, named checks (dead_speaks, prop_teleport), failures become actor memory, a measured errors-per-take chart (the aimogus lesson), and a real build order. C has the better one-line pitch and the better live moment (a scene is rejected and rewritten on screen).

## Recommendation
**Base: A (TAKE 37).** Best must-have coverage, lowest demo risk, measured learning, and Bruin is the plot device. B is a close second on idea and Impact but its solo build and second-human dependency are the highest risk; do not run B.

## Graft in (2-4)
1. From B: the Bruin inference asset labels each line `intent` (sincere/bluff/panic) and that typed column drives the Runware delivery direction, so voices leak tells. Gives Bruin and Runware a tighter shared loop.
2. From B: Glasser cost-per-call as a ledger line (cheap, picks up the $100 prize and the decision-log must-have) and a memory-on vs memory-off ablation number over headless takes.
3. From C: pitch line "dbt for fiction" and a live CONTINUITY ERROR rejection plus rewrite shown once in the video, before the retake montage.
4. From C (optional, only if keys work in 15 min): a different model per actor through BAND adapters; fall back to personas.

## Factual issues vs sponsors.md
- A and B: "Gemini Flash TTS" with delivery direction comes from a Runware LinkedIn post. sponsors.md only verifies `audioInference` with `fishaudio:s2.1@pro`; the per-voice parameter and the Gemini model id are UNVERIFIED. HeyGen Avatar 6 API model id and parameters are also unverified (LinkedIn only).
- A and B: cognee memory is from a BAND LinkedIn post; sponsors.md says BAND's Memory API is Enterprise-only. Stretch only, as both say. Memory must live in the Bruin mart.
- A and B: `bruin query` flag shape is UNVERIFIED (sponsors.md says run `--help`). The inference asset syntax is unverified (LinkedIn); both name a Python-asset fallback, which is honest.
- C: "semantic layer" is not in sponsors.md; Antigravity agents in BAND are a LinkedIn mention only, not setup-verified.
- B: Glasser "live commodity prices" is not documented; sponsors.md lists Keepa, Financial Datasets, etc. Check an endpoint exists.
- A: Telem as a "writer's room" is fine; sponsors.md says keep it an occasional tool, which A does.
- Neither A nor B mentions Windows: run Bruin in Git Bash (sponsors.md).

## Stage-embarrassment risks
- A: capsule rigs plus a lip-synced photoreal avatar close-up clash; keep the avatar to 1-2 shots or cut it. The error-per-take curve may not fall cleanly; show all takes, do not cherry-pick. A judge may ask whether you wrote the checks to match the sim; answer: the checks are the canon, the actors fail them. The final output must be a real 1-3 min short, not a replay recording of a debug stage.
- B: second human absent or laggy; a round stalls on `bruin run`; a live LLM error mid-trade. Judges forgive nothing live.
- C: ships as a slide. Also "different model per character" fails visibly if a key rate-limits.
