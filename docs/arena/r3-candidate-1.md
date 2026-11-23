# R3 candidate 1: METER TOWN (Track 02, Game)

## Concept
A 3D model-railway-sized town of 40 houses runs on real smart-meter readings, and the night before bills go out, three agent crew members (Ledger the billing clerk, Volt the lineman-forecaster, Audit the auditor) repair the town's Bruin billing pipeline while two humans play alongside them: the **Truck** (a judge on their phone, one ground-truth meter inspection per round) and the **Operator** (holds the release key). The agents have conflicting paychecks (Ledger is paid for on-time bills, Volt per faulty meter caught, Audit per zero-error run), so they trade backing, form alliances, and sometimes betray: an agent that can *repair* a failing check can also quietly *loosen* it, and only lineage catches it. Every run ends with bills flying to every house (faces go happy, amber, or furious) after the named Operator approves or blocks the release in the BAND room.

## Builder's edge (why the pitch has depth)
Grows from **Infosys for Southern California Edison**: Aakash turned a week-long manual billing data check into a daily automatic job with zero errors, and his forecasting caught a faulty meter before bills went out. Meter Town is that exact job with agents in it, so every Q&A answer is first-hand ("a stuck meter looks like this in the readings; this is the check that catches it"). Second root: his **show-your-work signature** (postcheck, payroll-import-gate, TrueBind): no agent claim is allowed without a cited row. Third: **Dagster** contributions, so pipeline/lineage vocabulary is native, not borrowed.

## Rubric, criterion by criterion
1. **Exclusions (gate): pass.** Not a recipe or track-brief idea; no market (agents trade *votes*, not goods), no hidden traitor or deduction (betrayal is incentive-driven and visible after the fact), no claim/quote verification (it is numeric meter anomalies), no jobs, no named game.
2. **Track 02 musts (gate):** 2 humans (Truck on phone, Operator on laptop) + 3 agents in one 3D world; own goals + memory (Bruin `mart.agent_memory`); ally/trade/compete/betray (side-room deals, check loosening); agent-caused world event (agents alone vote to quarantine a feeder: a whole street goes to amber "estimated bill", lights dim). **Run it twice, provable:** same seed, two run_ids; `bruin data-diff` on `mart.decisions` and `mart.bills` shows the divergence on screen, plus the run-2 prompt visibly carrying run-1 memory ("Ledger loosened `bill_within_band` last run, trust 0.4").
3. **Bruin essential (20):** the game *is* a Bruin pipeline, in Bruin's own pitch shape: agentic data engineering, self-healing pipelines, data contracts, inference assets, "how do I know the AI's answer is correct?". Delete Bruin and there is no world, no repair action, no betrayal, no proof.
4. **BAND delete test (15), 4 signals:** dependent handoff (Volt's cited anomaly must be answered by Ledger: hold or estimate; Audit rules on the answer); roster at runtime (each failed check opens an incident room; the on-duty agent calls `band_lookup_peers` + `band_add_participant` to pull in Volt or the Truck only when ground truth is needed); boundary (Ledger-Volt side deals live in a mention-scoped side room Audit cannot read; Audit only sees the effect via git lineage); blockable verdict (Audit can veto; the **named Operator types approve/block in the room** to end every run).
5. **Builder's edge (15):** above; strongest possible: the demo is his old job.
6. **Originality (15):** nobody else in the room will make the *data pipeline itself* the playfield, and "the repair permission is the cheating permission" is a real insight about agentic data engineering, not a genre reskin.
7. **Judge form (15):** Presentation (opens on houses lighting up and a bill fight in voice); Execution (live, two devices); Innovation (above); Impact (below); Implementation (real Bruin checks, lineage, BAND console, all in the repo README).
8. **Fun for a non-gamer (10):** no controls to learn: the judge taps a house to send the truck, the Operator says yes or no. The emotional beats are the ones the attention teardown says spread: "my AI clerk loosened the check to make the deadline", "run 2: the auditor didn't trust him anymore." Hook line: "3 AIs and 1 judge have 10 minutes to bill a town without overcharging grandma."
9. **Solo buildability (10):** one Python server, primitives-based Three.js, DuckDB; see build order.

## Sponsors: essential role and on-screen proof
- **Bruin (essential, $1000/$500).** Pipeline (DuckDB): `raw.readings` (Python/ingestr asset: 40-household slice of the public London smart-meter data, fitting since Bruin is UK-based; faults injected by seed: stuck, spike, reversed, gap) -> **inference asset** typing every reading `anomaly_class` with `accepted_values` checks on the typed column (Bruin's Oct release) -> `stg.readings` (`not_null`, non-negative, monotonic cumulative) -> `mart.bills` (custom check `bill_within_band` vs forecast) -> `mart.decisions` (BAND room events) -> `mart.agent_memory`. Agents act through `bruin mcp`/CLI: query (read-only), `propose_patch` (edits an asset on a git branch), `bruin run`, `bruin lineage`. **On screen:** the Plant building shows each asset as a lit/red tower; the decision log cites row ids; a "loosened check" shows as a red lineage diff; `data-diff` between runs.
- **BAND (essential, $500).** Each agent is its own registered Remote Agent; humans are room participants. **On screen:** glowing lines between characters mirror mentions; Band console room shown in the demo and video.
- **Runware (essential for the Voice booster, $200).** Gemini Flash TTS with plain-language delivery direction per agent ("tired night-shift clerk"), cached by line hash; character portraits for the log. **On screen:** agents speak their arguments; cost per run in the footer.
- **Telem (earns its place, cut-able, $500/$300/$100).** Volt must tell a real cold-snap spike from a broken meter: one Telem fetch of historical weather for the reading date. **On screen:** decision log line "spike on 2013-02-11 explained: -3C (Telem trace #id)".
- **AdaL:** cuts the required demo video. **Teamily:** mandatory chat, used as the build log.
- **Skipped as bolt-ons:** Glasser (no structured paid data the world needs; Telem covers the one external fact), Finch, Casuro, Lingcode.

## Impact (investable)
Agentic data engineering is arriving (Bruin's own "agent mode"); the unsolved problem is trust: the agent allowed to fix a broken check is the agent able to weaken it. Meter Town's engine is the product: an agent repair crew whose every patch is lineage-tracked, critic-vetoable and human-released, aimed first at regulated pipelines where a wrong output reaches a customer (utility billing, payroll imports, insurance quotes: three domains Aakash has shipped in). Ask: design partners among Bruin users; wedge is the release gate, not the agents.

## Data shape and architecture
Event: `{run_id, round, agent_id, action, target_row, cited_rows[], stated_reason, room_id, outcome}` -> JSONL -> Bruin. FastAPI + WebSocket server holds world state and relays BAND room events to clients; three BAND agents (Python `band-sdk`, Anthropic adapter) each with Bruin tools; Three.js diorama (houses, Plant towers, capsule characters walking to targets, packets on wires, log panel); phone page = same scene, tap-to-inspect. Run loop: round tick -> readings land -> `bruin run` -> failed checks open incident rooms -> agents deliberate/patch -> rerun -> after round 5, Operator approve/block -> bills animate -> events ingest -> memory mart for next run.

## Build order (riskiest first), checks, fallback
1. **11:30 Bruin on Windows** (Git Bash): pipeline + seeded faults. Check: `bruin run` shows a red check on the injected stuck meter. Inference asset timeboxed 20 min, else Python asset calling Claude with typed output (same checks).
2. **12:15 BAND chain:** 3 agents, incident room, Volt -> Ledger -> Audit with veto, `propose_patch` on a git branch. Check: console room shows the dependent chain and a veto.
3. **14:00 ledger + memory:** room events -> `mart.decisions`, `mart.agent_memory` seeding prompts. Check: run-2 prompt contains a run-1 memory row; `data-diff` non-empty.
4. **14:45 diorama:** houses, Plant, 3 walking characters, log panel. **15:00 fallback:** if the 3D scene or BAND websockets are not live, drop to a 2D top-down canvas of the same town and run agents through BAND REST polling; second human joins from a second browser window. All 5 musts still hold.
5. **15:45** phone join + Truck inspection; Operator approve/block in room. **16:30** Runware voices, Telem weather. **17:00** record run 1 and run 2, AdaL cut, submit by 17:40.

## Cut list (in order)
Telem weather -> Runware portraits -> inference asset (Python fallback) -> Runware voice (browser speech) -> phone (second window) -> 3D (2D canvas). Never cut: Bruin checks + lineage, BAND room with veto and Operator decision, run-twice diff.

Risk to say out loud: Ledger may not choose to loosen a check in a given run (it is a real choice under an on-time incentive, not scripted). Both outcomes demo well; run 2 shows the memory either way.

## Alternatives considered and rejected
- **Actintro mixer** (attendee agents negotiate intros, BAND contact requests as double opt-in): great BAND fit, but trading intros reads as an Agent Market reskin, Actintro guest data is private, and Bruin would only be a feature table, not the playfield.
- **Same town as a Film (Track 01):** Runware's home turf, but agents must decide the ending, which collides with ending on a human approve/block; lowest compounding per the teardown.
- **Grow: apprentice on-call data engineer coached by the crew:** too close to Monday at the Office / ER Triage Trainer, and Grow has the weakest attention signal.
- **IPL selection room** (cricket data, agent selectors): an auction is a market reskin and stakes feel low to judges.
- **TrueBind insurance adjusters:** drifts into claim verification (exclusion 2).
