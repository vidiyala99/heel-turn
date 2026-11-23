# Round 2, Candidate A: "TAKE 37" (Track 01, Film)

## Concept (3 sentences)
A 3D sound stage where three diva actor agents improvise a short film take after take, a director agent gives notes between takes, and a Bruin pipeline plays the script supervisor: every take is ingested, continuity errors ("the butler is dead but still talking", "the knife teleported") fail data checks and become a blooper reel, and the notes plus failures become each actor's memory for the next take. The actors also have selfish goals (most screen time, the last line, survive to the end), so they scheme in a private green room and the ending changes every take. The demo shows takes 1, 4 and 8 with errors per take falling on a Bruin chart, then plays the best take as a lip-synced, voiced 60-second short.

## Why it is unique
- Avoids the cliché "agents verify claims/quotes against the web, shown in a Three.js scene". Checks here enforce **internal canon** (who is alive, where, holding what), not external truth; no fact-checking, no citations.
- Not a wrapper: there is no chat box and no single assistant. It is a learning loop (take, check, note, retake) with a measured result, the aimogus lesson: show numbers that prove agents changed.
- Bruin is the plot device, not a dashboard bolted on: a failed check visibly stops the take ("CUT!") on screen.

## Per sponsor: limit-pushing use and on-screen proof
| Sponsor | Use that pushes the limit | Proof on screen / in repo |
|---|---|---|
| **Bruin** (mandatory, $1000) | Pipeline per take: `raw.beats` (Python asset reads take JSONL) -> `stg.beats` (`not_null` cause, `accepted_values` action, `unique` beat_id) -> **custom SQL continuity checks** (dead-speaks, double-location, prop-teleport, note-ignored) -> **inference asset** that has a model label every beat with a typed column (`beat_type`, `followed_note bool`, `emotion`) with `accepted_values` on the typed output -> `mart.actor_memory` (notes received/followed, errors caused) -> `mart.take_scores`. Director agent reads stats with `bruin query`. Memory that changes decisions lives in the mart. | Red check names flash as "CUT: dead_speaks, beat 14"; `bruin run` output green on the final take; lineage graph slide; chart of errors and on-note rate per take read from `mart.take_scores`. README lists every Bruin feature used. |
| **BAND** ($500, house favorite) | Each actor and the director is its own BAND agent (own id/key). Director calls "action" and routes by @mention; actors post beats; a **private green-room side-room** (`band_create_chatroom`) where two actors conspire to cut the third's lines, which the third cannot see (a boundary BAND enforces); the director can **veto** a beat (blockable verdict). cognee memory as stretch so notes outlast the room. | BAND console room replay in the video; glowing lines between characters when they message; green-room messages shown as whispers only to the camera. |
| **Runware** ($200) | **Directed Gemini Flash TTS**: the director's note literally becomes the delivery direction string ("say it like you just lost everything"), so voices change between takes. Three distinct voices. **HeyGen Avatar 6** lip-sync for 2-3 close-ups in the final cut (their newest launch, AI film is their home turf). Runware images for actor headshots and set dressing. | Same line played from take 1 and take 8 with different delivery; lip-synced close-up in the short; cost per take in the ledger. |
| **Telem** ($500/$300/$100) | Writer's room: the opening event is pulled from a real event found via Telem search + fetch (multi-engine), and actors do "method research" (one search each per take about their role's era/job). | Telem trace IDs on research beats in the ledger; console screenshot. Secondary, honest. |
| **AdaL** (Pro) | Cuts the 1-3 min demo video and the blooper reel. | The submitted video. |
| Glasser ($100), Lingcode ($200) | Glasser only if time: producer agent prices a prop/location from real data, cost shown per call. Lingcode is Mac-first: skip. | n/a |

## Impact / invest story for VC judges
Every long-running generative world (AI series, games with persistent NPCs, interactive fiction, agent simulations) breaks on **continuity**: characters forget, contradict, resurrect. Today studios fix it by hand. TAKE 37 shows a **canon layer**: agent behaviour as rows, canon as data-quality checks, retakes driven by failed checks, memory from a governed mart. That is evals-as-a-pipeline for narrative agents. Buyers: AI film studios (Chroma Awards crowd), game studios shipping LLM NPCs, agent-sim companies. Ask: "would you fund the script supervisor for every AI-made show?"

## Core data shape and architecture
Beat row (JSONL, one per action): `{run_id, take, tick, beat_id, agent_id, action: move|say|give|take|attack|die|exit, target, location, prop, line, delivery, cause_beat_id, note_id_ack, room: set|greenroom, cost_usd, telem_trace}`.
Flow: BAND set room (director + 3 actors, recorder listener) -> take JSONL -> `bruin run` (DuckDB) -> checks + marts -> director reads `bruin query`, posts notes -> actor prompts seeded from `mart.actor_memory` -> next take. Frontend: Three.js stage **replays** the take JSONL (capsule rigs walk to marks, gesture, fall), ledger panel, check badges, clapperboard "TAKE n", cached TTS mp3s. Replay (not live render) decouples agent latency from the visuals.

## Riskiest-first build order (5.5 h, with checks)
1. **0:00-0:35 BAND take loop.** 4 agents, director-driven ticks, 20-beat take written to JSONL. Check: two takes, different endings, files on disk.
2. **0:35-1:20 Bruin pipeline.** raw/stg/checks/marts; inference asset (fallback: Python asset calling the LLM per row with typed output). Check: a hand-made bad take fails `dead_speaks`; a clean one passes; time `bruin run` (<30 s target).
3. **1:20-1:50 Memory loop.** Failures + notes -> `mart.actor_memory` -> next prompt. Check: 6 headless takes, errors per take trend down in `mart.take_scores`.
4. **1:50-3:05 Three.js stage replay** + ledger + CUT overlay. Check: take replays end to end, every beat moves something.
5. **3:05-3:45 Runware directed TTS**, 3 voices, cached by hash. Check: same line, two deliveries.
6. **3:45-4:15 Final batch run** (8 takes), chart, green room visible, Telem premise + research beats.
7. **4:15-4:40 Avatar 6 close-ups** (stretch).
8. **4:40-5:30 Record, AdaL cut, README, submit early** (submission order sets demo order).

## Top risks and cut list
- BAND turn latency makes takes slow: keep takes to 20 beats, run batches headless before the demo, replay live. 
- Inference asset may need setup I have not verified: fallback Python asset, same typed column and checks.
- "Learning" could be noise: measure deterministic check failures, not vibes; fix seed premise, show all takes.
- `bruin run` on Windows slow or flaky: run in Git Bash, single DuckDB file, verify tonight's install.
- Cut order: Glasser -> Avatar 6 (static headshot + voice) -> Telem research beats -> cognee -> 3D niceties (keep primitives). Never cut: BAND agents, Bruin checks, memory chart, voices.

## Alternatives rejected
- **Contraband** (smuggler agents vs a Bruin customs checkpoint): fun, but inspection is verification, too close to the cliché.
- **Multiverse story tree** (30 headless runs, render the rarest ending): pretty, no learning, weak characters on screen.
- **Agent Market with live Glasser prices**: already a site build recipe, many will do it.
- **Game track co-op**: needs 2 humans plus networking, too much for solo in 5.5 h.
- **Grow track coach panel**: closest to an AI wrapper with a face; Casuro has no API.
