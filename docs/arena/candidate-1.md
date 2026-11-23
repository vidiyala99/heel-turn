# Candidate 1: "The Mary Celeste Inquiry" (Track 1, agent-written animated film)

## 1. Concept
In 1872 the brigantine *Mary Celeste* was found drifting, intact, with nobody aboard; the case is still unsolved. Six AI agents re-stage the salvage inquiry on the ship's 3D deck: four advocates with conflicting incentives research the real historical record live on the web, file evidence and argue, and a Judge rules on what happened, but an exhibit only counts if a Bruin pipeline proves its quote really appears in the source the agent fetched. Every take plays out differently (mutiny, insurance fraud, a waterspout, fumes from the alcohol cargo, or "no verdict"), and agents caught citing invented evidence carry that reputation into the next take.

Why it wins: Bruin is the plot device, not a log. Its quality checks literally decide who the jury believes, and its semantic metrics are what the Judge reads to rule. The story is "hallucinations get caught on screen", which any judge understands in 5 seconds. Real history means no defamation risk, no living people and no crime-planning look (heist ideas were rejected for that). It has a mystery, a courtroom, a ship, voices and a verdict, and it fits in a 2-minute film.

**Cast** (each one is its own BAND agent with its own goal): **Judge Flood** (wants a defensible verdict, reads only Bruin metrics); **Adjuster** (insurer, wants a fraud verdict so nothing is paid); **Salvager Captain** (wants an innocent-abandonment verdict so the salvage reward is paid); **Journalist** (wants the most sensational theory that holds up); **Spiritualist** (pushes the sea-monster theory and is tempted to fabricate; colludes with the Journalist in a private side-room); **Clerk** (no opinion, operates Bruin, and can block a verdict).

## 2. Sponsor roles and demo proof
| Sponsor | Load-bearing role | What the demo shows |
|---|---|---|
| **Bruin** ($1000/$500) | The court's evidence system. SQL assets on DuckDB: `raw_events` and `raw_sources` (read the JSONL) -> `stg_exhibits` (checks: `not_null` source_id, `unique` exhibit_id, `accepted_values` theory) -> `mart_admissible` (per row `quote_found = contains(lower(source_text), lower(quote))`, plus a custom check that **no admitted exhibit lacks a verified quote**) -> `mart_agent_credibility` (across takes) and `mart_run_outcomes`. Semantic model `inquiry.yml` with metrics `theory_support`, `admissibility_rate`, `agent_credibility`. The Judge's verdict prompt contains only `bruin query --semantic-model inquiry --metric theory_support` output. Credibility from earlier takes seeds every agent's prompt next take (the memory bonus). | A forged quote gets an INADMISSIBLE stamp on the 3D evidence board with the check's reason; the Clerk blocks the Judge's first ruling because it rests on that exhibit; `bruin run` output with green checks; the lineage graph; a chart of endings across 5 takes; the Spiritualist's rejection rate falling across takes. |
| **Telem** ($500/$300/$100) | The only way any agent can learn a fact. The `research(q)` tool calls Telem `/v1/search`, then `/v1/fetch`, and stores the page markdown plus the request/trace id in `raw_sources`. No Telem fetch means no source_id, which means the exhibit is inadmissible. | Each exhibit card shows its source URL and Telem trace id; the video cuts to the same trace in the Telem console. |
| **BAND** ($500) | Six registered remote agents in one room, routed by @mention. The Judge chooses at runtime who speaks next. The Spiritualist and Journalist have a private side-room (`band_create_chatroom`) that BAND keeps hidden from the others. The Clerk's block is a real veto the Judge has to answer. My code only observes the room and mirrors it to JSONL; it never drives turns. | The BAND console room next to the film; the side-room scheming is revealed in the ledger after the verdict. |
| **Runware** ($200) | One distinct TTS voice per character for every line (`audioInference`, mp3 cached by text hash); 6 portrait images used as face textures; one text-to-3D GLB of the ship (`tripo`). | Characters speak in their own voices; the deck model. |
| **AdaL** (Pro plans) | Cuts the film (title cards, take-1/take-2 split screen) and the demo video. | Credited in the README; the video itself. |
| Glasser, Lingcode | Not targeted: no natural fit for an 1872 case or a 3D film. Saying so beats a bolt-on. | - |

## 3. Data shapes and architecture
`events.jsonl` (one line per room event): `{run_id, seq, ts, agent, kind: say|research|file_exhibit|move|block|verdict, to, text, reason, move_to, emote, exhibit:{exhibit_id, theory, claim, quote, source_id}}`.
`sources.jsonl`: `{source_id, run_id, agent, url, telem_trace_id, fetched_at, text}`.
Replay bundle `take_<run>.json`: events + mart snapshot after each Bruin run + audio URL per line.

Modules: `court/agents.py` (6 BAND agents, Anthropic adapter, persona prompts, turn budget) · `court/tools.py` (research, file_exhibit, run_checks -> `bruin run`, metric -> `bruin query`) · `court/observer.py` (room -> JSONL) · `bruin/` (pipeline, checks, semantic model) · `voice/runware.py` (assets and TTS cache) · `stage/` (Vite + Three.js: deck scene, capsule characters with portrait faces that walk, bob and gesture via tweens, speech bubbles, 3D evidence board, ledger sidebar reading marts, replay player) · `serve.py` (static + replay JSON).
**Ahead of time (at the event, before the demo):** Runware assets; 5 takes run in the background so the marts hold real cross-take memory and an endings distribution. **Live:** one new take runs (about 4 min) while the stage replays it, with the recorded take as the fallback. Nothing is coded before 11:30; tonight is accounts and installs only.

## 4. Build order (riskiest first, each step ends in a check)
- **11:30-12:05 Bruin on Windows.** Pipeline over a hand-written fixture (2 sources, 3 exhibits, 1 forged quote). Check: `bruin run` passes, the forged row shows `quote_found=false`, and the `theory_support` metric returns from a Python subprocess in under 10 s. Fallback: plain `bruin query` SQL on the mart.
- **12:05-12:35 BAND.** Two registered agents exchange @mentions, one calls a tool, the observer writes JSONL. Check: the console room shows it and the JSONL has the lines.
- **12:35-13:00 Telem.** `research()` stores a real fetch. Check: a real quote passes the Bruin check, an invented one fails, and the trace id is saved. Lunch: Runware asset script runs (portraits, GLB, 6 voice samples).
- **14:00-15:00 Full cast, one take.** Six personas, 3 rounds, Clerk block, verdict. Check: the take ends with a verdict, at least 1 rejected exhibit, and marts refreshed after each round.
- **15:00-16:15 Stage.** Scene, movement to marks (podium, board, stand), bubbles, board stamps, ledger panel, replay. Check: a full take replays end to end at 1080p with no console errors.
- **16:15-16:45 Voice and memory.** TTS per line; 4 more takes in the background. Check: `mart_run_outcomes` shows at least 2 distinct endings and credibility shifts between takes.
- **16:45-17:20** Record take 1 vs take N; AdaL cut (90-150 s). **17:20-17:45** README sponsor table linking files, plus lineage, BAND and Telem screenshots; push the public repo; submit by 17:45.

## 5. Top risks and cut list
1. **Bruin CLI latency or semantic-layer flags on Windows.** Checked first; fall back to SQL marts, and run Bruin once per round, not per message.
2. **The BAND mention loop stalls or runs away.** The Judge has a turn budget and a closing rule. A watchdog posts a human "Usher" nudge into the room (human participants are allowed), never a scripted driver.
3. **3D eats the afternoon.** Primitives plus portrait faces, no rigging, and a fixed camera with 3 marks.
**Cut in order:** Glasser (already cut) -> ship GLB (primitive hull) -> side-room collusion -> live take (replay only) -> Runware TTS (browser speech) -> endings chart (mart table on screen). Never cut: Bruin checks gating exhibits, Telem as the only source, 6 BAND agents, the ledger.

## 6. Alternatives rejected
- **Heist with a real museum and live recon:** most cinematic, but live recon of a real target reads as crime planning.
- **Re-investigating the Gardner heist:** real living suspects, so agents would be accusing people (defamation).
- **T2 co-op game:** needs 2 humans and realtime networking, which is the highest demo risk for a solo builder.
- **T3 coaching:** a live human-in-the-loop voice loop, and too close to the banned interview territory.
- **Newsroom fact-check room:** the same Bruin-as-gate mechanic, but a dry visual with no ending people care about.
- **Bruin as a run logger:** what every other team will do; it fails the "load-bearing" test.
