# Candidate 2: "Last Pod" (Track 1, agent-written film, with a Bruin-governed world)

## 1. Concept
A 3D animated short: five survivors on a sinking research vessel (Captain, Medic, Engineer, Smuggler, plus a hidden-agenda Stowaway) fight over a single escape pod that seats three. Every character is its own BAND agent; plot beats are @mention negotiations, private side-room schemes and acts on deck, and the ending (who sails, who is left, who betrayed whom) is decided by the agents, so the same setup yields different films. The ship's state (flooding, pod seats, rations, trust) is not prompt text: it lives in a Bruin pipeline with quality checks, and agents must query it, so a cheating or hallucinated action is blocked by a failing check and shown on screen. Memory carries across runs ("Sequel mode": survivors of film 1 remember who left them), which hits the learning/memory bonus. Judges (data people, AdaL GTM, BAND, Telem) see a film plus a visible, governed "why" ledger and an ending-distribution chart proving the outcomes are not scripted.

## 2. Sponsors: role and proof in the demo
- **Bruin ($1000/$500), load-bearing.** Three jobs, none is logging. (a) *Rules enforcement:* each proposed action is appended to `raw.events`; `bruin run` builds `stg.actions` with checks (`accepted_values` on action, custom SQL checks "amount spent <= owned", "seats taken <= 3"); a failed check = action rejected, agent must re-decide (the blocked verdict). (b) *World state and memory as marts:* `mart.world_state`, `mart.agent_memory` (trust matrix, grudges, favours owed), read via the semantic layer (`bruin query --semantic-model ship --metric trust_score --dimension agent`; fall back to plain `bruin query` SQL if flags differ) and injected into each agent's prompt. (c) *Cross-run analytics:* `mart.run_outcomes` and an endings histogram over 8+ runs. Demo shows: a red check blocking a cheat on screen, the lineage graph, the histogram, and run 2's Captain citing a memory row from run 1.
- **BAND ($500).** Every character is a separately registered agent (own id/key, `AnthropicAdapter`), plus a Director agent that can veto a beat and open a `band_create_chatroom` side-room when two agents scheme privately (mention-scoped visibility is a boundary BAND really enforces: the Stowaway's plan is invisible to the Captain). Demo shows the BAND console room beside the 3D deck, thoughts via `band_send_event` mirrored to the log.
- **Runware ($200).** Per-character portraits (billboard faces on the 3D bodies), ship textures, and per-character TTS (`audioInference`, distinct voices, cached by line hash, browser TTS fallback). Demo: five distinct voices narrate decisions.
- **Telem ($500/$300/$100).** Engineer and Captain call Telem search/fetch for real maritime facts (lifeboat capacity rules, cold-water survival times) and quote them in arguments; the Telem trace id is attached to that ledger row. Demo shows a ledger row linked to the Telem console trace. One call per scene; a tool, not the core mechanic.
- **AdaL:** cuts the demo video. Skip Glasser, Lingcode, Casuro, Finch.

## 3. Data shapes and architecture
Event (one JSONL line): `{run_id, scene, tick, event_id, agent_id, action[speak|offer|share|steal|sabotage|board|vote], target, amount, say, stated_reason, private, telem_trace_id, ts}`.
Bruin project `bruin/ship/`: `raw.events` (Python asset reading JSONL into DuckDB) -> `stg.actions` (checks) -> `mart.world_state`, `mart.agent_memory`, `mart.run_outcomes`, plus `semantic/ship.yml` (metrics: trust_score, rations_left, seats_left, betrayals).
- **Ahead of time (at the venue, first hour; no pre-event code):** register BAND agents, generate and cache Runware portraits/voices by script, character bios JSON.
- **Live (per scene, ~8 scenes = 1-3 min):** engine (FastAPI + asyncio) picks speakers; BAND room messages carry proposals; engine appends events, runs `bruin run` (seconds on DuckDB), reads metrics, validates, resolves effects, raises flood level. Frontend (Three.js, no build step): capsule bodies with Runware face billboards, walk/turn/gesture tweens, deck tilting with flooding, pod launch finale; side panel = ledger (action, why, Bruin check status, Telem trace) driven by `mart.*`. The recorded film replays a chosen run's event file with cached TTS, so the cut is deterministic and cannot fail live.

## 4. Build order (riskiest first, each ends in a check)
1. 11:30-12:00 **Bruin spike:** install (Git Bash), project, Python raw asset, SQL staging with a failing custom check, semantic metric query via subprocess. Check: `bruin run` green; corrupt a row and it turns red; one metric prints a number.
2. 12:00-12:30 **BAND spike:** 5 agents + Director in a room, one @mention round trip, one side-room. Check: B answers A in-process and the event lands in our JSONL.
3. 12:30-13:00 **Engine with scripted dummy agents.** Check: a full run ends and `run_outcomes` has one ending row.
4. 14:00-14:45 **LLM agents + memory injection.** Check: run twice; run 2 prompt contains a run-1 grudge and a different action results.
5. 14:45-15:45 **Three.js stage + ledger panel.** Check: replay on screen with moving characters, ledger rows match events.
6. 15:45-16:15 **Runware voices/portraits, Telem call.** Check: 3 distinct voices play; one ledger row shows a trace id.
7. 16:15-16:45 **Batch 8 runs, histogram, pick best film, clean capture.** Check: 3+ distinct endings in the histogram.
8. 16:45-17:35 AdaL cut, README listing exact Bruin/BAND features, public repo, submit. Check: submission page shows repo + video. 17:35-17:55 buffer.

## 5. Top risks and cut list
1. **Bruin on Windows / semantic-layer flags unverified / slow per-scene `bruin run`.** Spike first; run per scene, not per action; fall back to SQL through `bruin query`.
2. **BAND integration and latency (6 websocket agents, LLM round trips).** Drop to 4 characters + Director, shorter scenes, pre-run films and replay.
3. **3D polish time.** Primitives only, no rigs; replace pod-launch cinematic with a fade.
Cut order: Telem -> Sequel mode (keep within-run memory) -> Runware TTS (browser TTS) -> Runware portraits (colored faces) -> Director veto. Never cut: Bruin check gating, one BAND agent per character, visible ledger.

## 6. Rationale and rejected alternatives
Solo and 5.5 hours makes Track 2 (2+ live humans, netcode, real-time agents) the highest-risk track, and Track 3 skews to coaching/interview themes that are off limits and weak on spectacle. Track 1 lets me pre-run films so the demo cannot fail live, and "different endings per run" is exactly what Bruin analytics prove. Rejected: (a) trading town (T2) with Glasser real prices: touches more prizes but needs two live humans and multiplayer sync. (b) Courtroom film: talky, little movement, no hard numbers for Bruin. (c) Heist crew with traitor: similar, but a scarce-pod economy gives Bruin real checkable quantities (seats, rations) instead of vibes. (d) Bruin as a post-hoc dashboard: the most common entry; making it the rules and memory authority is the differentiator for the $1000.
