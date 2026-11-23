# r3 candidate 2: BROWNOUT BLOCK (Track 02, Game)

## Concept
A co-op heat-wave game on a toy neighborhood grid: 2 humans (Grid Operator, Neighborhood Rep) and 4 agents (Dispatcher, Hospital, Bakery, Meter Auditor) must keep the lights on as demand outruns supply, while one smart meter quietly lies. Every agent sees the grid only through a Bruin pipeline whose checks quarantine bad meters, and every agent is its own BAND agent in one room. The round ends when the Dispatcher posts a load-shed plan and a named human, Operator Dana, approves or blocks it in the BAND room. Track 02 Game.

## Grows from (pitch depth)
- **SCE/Infosys (2021-24):** Snowflake billing pipelines 1h to 20 min, a week-long manual data check turned into a zero-error daily job, and forecasting that caught a faulty meter before bills went out. The lying meter is that real story, played as a game. Aakash can talk meter data, checks and quarantine from experience.
- **Show-your-work repos (postcheck, answer-check, payroll-import-gate):** an action only fires on rows that passed a tested check. Same rule, now for dispatch.
- **Actintro:** a graph of 900+ nodes with deterministic checks and right-sized models: here a grid graph (feeders, houses, critical loads), cheap model for routine ticks, strong model only for the plan.
- **Dagster:** asset and lineage vocabulary maps straight onto Bruin.

## Rubric scoring (self-score)
- **Gate 1, exclusions:** not a recipe or track example (not trading, betrayal, deduction, ER triage, survival). Not claim-verification (agents act on data quality; nothing is fact-checked in a 3D scene). Not job seeking. Not a named game. Pass.
- **Gate 2, Track 02 musts:** 2 humans + 4 agents in one visual world; own goals (Hospital: protect its reserve; Bakery: stay open; Dispatcher: minimize outage hours; Auditor: data integrity) and memory from `mart.agent_memory`; ally/compete via capacity swaps and exemption deals; one world event caused by agents alone: a **cascade trip** when the Dispatcher over-trusts a stale meter and overloads feeder 2 (a flagged ledger row with its causal chain). **Run it twice:** the seed changes the heat curve and which meter lies; run 2 agents carry run-1 grudges and rules from Bruin; the `run_outcomes` mart shows both runs side by side.
- **3 Bruin (20):** essential, see below. Expect 17-19.
- **4 BAND (15):** 3+ signals, ends on human approve/block. Expect 13-14.
- **5 Edge (15):** 14-15.
- **6 Originality (15):** nobody else will build a grid game; the twist is "agents must trust data", not "agents lie". Expect 12.
- **7 Judge form:** Presentation (town lights going out, one human decision), Execution (real pipeline, two real runs), Innovation (data quality as gameplay), Impact (below), Implementation (checks, tests, lineage). Boosters: memory that changes decisions (yes), voice (yes, cheap), 3D (no, accept the loss).
- **8 Fun:** a non-gamer watches houses flicker out, a hospital agent pleading in a speech bubble, then clicks Approve or Block. No skill needed. Hook: "Can 2 humans keep a town lit when 1 meter lies?"
- **9 Buildability:** 2D canvas, DuckDB, 4 LLM calls per tick, 8 ticks per run. Medium risk (Bruin latency, BAND setup); fallback below.

## Sponsors: essential role and on-screen proof
- **Bruin (essential, the pushed shape: agent + pipeline + provable correctness).** Agents have no other view of the world.
  1. `raw.meter_readings` (Python asset per tick) -> `stg.readings_checked` (SQL; checks: `not_null`, `accepted_values` on status, range vs feeder load, rate-of-change check that catches the lying meter) -> `mart.grid_state_clean` (passing rows only; failures go to `quarantine`).
  2. **Inference asset** (their Oct release): a model judges every Dispatcher decision row and returns typed `justified_by_clean_data` and `harm_class`. That is the ledger "why" column and the cascade-trip proof.
  3. `mart.agent_memory` and `mart.run_outcomes` seed run 2 and prove run-it-twice.
  Proof on screen: `bruin run` with checks green, one red check on the lying meter, lineage graph, then the town reacting to that red check. Delete test: remove Bruin and agents see raw lies and the cascade is unavoidable.
- **BAND (essential).** Signals: (a) roster decided at runtime: on overload the Dispatcher uses `band_lookup_peers` + `band_add_participant` to pull in a Line Crew agent; (b) boundary Band enforces: Hospital's reserve level and the Bakery's exemption offer are mention-scoped private messages the other agents cannot see; (c) blockable verdict: a Safety Officer agent can veto a plan that sheds a critical feeder; (d) dependent handoff: Auditor flags a quarantined meter and the Dispatcher must answer with a revised plan. Ends on Dana approving or blocking in the room. Show the Band console room beside the town.
- **Runware (small but real):** portraits and per-agent TTS, cached by prompt hash, cost-per-run line in the ledger. Not core; stated as such.
- **AdaL:** required demo-video cut only.
- **Telem, Glasser, Casuro, Finch, Lingcode:** bolt-ons here (a live weather feed would be decoration). Skipped on purpose.

## Impact (investable)
Anyone putting agents near real equipment needs a flight recorder: every autonomous action traceable to checked data, every high-stakes plan gated by a named human. Pitch: "a decision ledger for AI operators in critical infrastructure; the demo is a toy grid, the product is the checked-data-to-approval trail." Buyers: utilities (Aakash knows the SCE data pain firsthand), and data platforms selling contracts. Ask: a pilot on one utility's demand-response desk.

## Data shape and architecture
- Event row (JSONL): `run_id, tick, event_id, agent_id, action, target, stated_reason, cited_rows[], cost_usd, outcome, world_json`.
- Flow: browser canvas town <-ws-> sim server (demand = heat curve x houses, supply cap, feeder limits) -> BAND room (4 agents + 2 humans) -> events JSONL -> `bruin run` per tick (DuckDB) -> agents query `mart.grid_state_clean` -> actions back to sim. The ledger panel reads the mart, not the app, so the screen shows pipeline truth.
- Humans: Operator (approve/block, tune supply); Neighborhood Rep (asks exemptions, privately messages Hospital).

## Build order (riskiest first, with checks)
1. 11:30 Bruin loop alone: sim writes a tick, `bruin run`, checks fire on a planted bad meter, agent reads the clean mart. Check: red check on the lying meter, clean mart excludes it. If one run exceeds ~4 s, batch 2 ticks per run.
2. 12:15 BAND: 4 agents registered; one private message verified invisible to a third agent; one runtime `add_participant`. Check: console room shows both.
3. 1:00 Sim + Dispatcher decisions + cascade; ledger with cited rows. Check: unit test that a decision citing a quarantined row is flagged.
4. 2:00 Town visuals, speech bubbles, Approve/Block UI.
5. 3:00 Run twice with memory; `run_outcomes` diff. Check: two recorded runs, different outcomes.
6. 4:00 Inference asset, Runware voices and portraits, Safety Officer veto.
7. 5:00 Record for AdaL, README listing exact Bruin features, submit before 6:00 (submission order sets demo order).
- **15:00 fallback:** drop the inference asset (rule-based ledger column) and Runware (browser TTS) first. If runtime add slips, keep private scoping + veto + human approval (still 2+ signals). If Bruin per-tick is too slow, run per round, and replay recorded events for the second run, labelled as a replay.

## Cut list (in order)
Runware voices -> inference asset -> Safety Officer veto -> Neighborhood Rep private chat -> Line Crew runtime add -> portraits. Never cut: Bruin checks feeding agents, one BAND private message, human approve/block, the run-twice mart.

## Considered and rejected
- **Actintro "room of 900" matchmaker party:** strongest personal edge, but reads as networking, looks like a chatbot with a graph, weak on movement and fun.
- **Insurance-claims town (TrueBind):** strong show-your-work, but dry, and claim checking edges toward the banned cliche.
- **IPL auction house (cricket pipelines):** fun data, but it is The Agent Market (bidding) in a cap.
- **Pipeline-on-fire (agents as data engineers fixing a broken DAG):** perfect Bruin fit, poor visuals, unwatchable for a non-gamer.
- **kWh trading market:** rejected deliberately; the game is shedding and trust, not trade, to stay clear of the Agent Market reskin.
