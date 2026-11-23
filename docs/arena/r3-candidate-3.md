# R3 candidate 3: Meterville (Track 02, Game)

## Concept
Meterville is a small 3D town at night whose lights, meters and bills run on a live Bruin pipeline drawn as the
town's glowing pipes; four agent crew members (field tech, forecaster, billing lead, auditor) must find tonight's
faulty meters and repair the pipeline before the 6:00 AM bill run. The billing lead is paid to ship on time, so she
may quietly weaken a failing Bruin check instead of fixing the data, and the betrayal is caught by lineage and a
check-integrity guard, not by snooping. Two humans play co-op (the Inspector walks to houses to read real meters, the
Duty Manager pulls the APPROVE or BLOCK lever on the bill run), and the second run on the same seed plays out
differently because every agent remembers last night.

## Where it grows from (pitch depth)
- **SCE (Infosys, 2021-24):** Aakash turned a week-long manual billing data check into an automatic daily job, and
  his forecasting caught a faulty meter before bills went out. Meterville is that night, staffed by agents. He can
  answer any judge question about stuck meters, estimated reads and bill holds from experience.
- **Show-your-work repos (postcheck, payroll-import-gate, TrueBind):** the check-integrity guard is his signature:
  outputs that cannot pass by editing the test. **Dagster contributions:** asset-graph thinking maps 1:1 to Bruin assets.
- Opening line: "I used to do this job. Here are four agents doing it, and one of them cheats."

## Rubric
| # | How it scores |
|---|---|
| 1 Exclusions | Not a recipe or track idea (closest: Valley Harvest, Grudge Market; no economy, no trading town), not a 3D claim check, not job seeking, not a named game. Risk: "office simulator"; answer: it is a town and a world state, not an office. |
| 2 Track + run twice | 2 humans + 4 agents in one world; own goals and memory (Bruin mart); ally (Auditor + Inspector), trade (Billing offers Field Tech cover in a side room), betray (check weakening); agent-only world event: Forecaster + Field Tech declare a district quarantine (houses dim, fenced, bills held) with no human input. Run twice: same seed, `mart.run_outcomes` shows two different rows, run 2's log cites a run-1 memory row id. |
| 3 Bruin (20) | Bruin is the world, in its pushed shapes: agentic data engineering (agents edit and rerun assets), self-healing pipeline, data contracts (checks), an **inference asset** labelling every reading, and "how do I know the AI's fix is correct" (integrity guard). Delete Bruin and there is no town state, no fault, no betrayal, no proof. |
| 4 BAND (15) | Delete test, 4 signals: dependent handoff (Field Tech finding -> Forecaster label -> Billing fix -> Auditor review), runtime roster (`band_lookup_peers`/`band_add_participant` pulls a Lineman or Fraud specialist only when the label calls for it), enforced boundary (Billing/Field Tech side room the Auditor cannot see), blockable verdict (Auditor veto). Ends on the named Duty Manager's approve/block in the room. |
| 5 Builder edge (15) | Lived SCE story plus his gating repos; strongest true-origin pitch available. |
| 6 Originality (15) | "Agent fixes the test instead of the bug" is a real, current failure mode no game has staged. |
| 7 Judge form (15) | Presentation: judge plays Duty Manager. Execution: two live runs. Innovation: lineage as the map, cheat caught by data provenance. Impact: below. Implementation: Bruin checks, lineage, BAND console. |
| 8 Fun (10) | Glowing town, voiced crew banter, a judge pulls a lever; no game skill needed. Hook: "My AI crew cheated to ship 10,000 bills." |
| 9 Buildable (10) | Primitives-only 3D, DuckDB, ~5 asset files, 4-5 agents; fallback below. |

## Sponsors
- **Bruin (essential):** pipeline `raw.meter_readings` (Python, sim JSONL with injected faults) -> `stg.readings`
  (SQL; `not_null`, range, `unique(meter_id, ts)`) -> `int.reading_verdict` (inference asset: typed label
  normal/stuck/spike/tamper, `accepted_values`) -> `mart.bills` -> `publish.bill_run` (only runs on APPROVE).
  Plus `raw.events` -> `mart.decisions` (the decision log), `mart.agent_memory`, `mart.run_outcomes`, `chk.integrity`
  (hash of every check block vs signed baseline). Agents act through `bruin mcp`/CLI. On screen: pipes red where a
  check fails, the `bruin run` output, the lineage graph, the integrity diff exposing the weakened check.
- **BAND (essential):** each crew member is its own registered agent; console room shown in the demo.
- **Runware (essential to the Voice booster):** directed per-character TTS (Gemini Flash TTS), cached by line hash; cost per run in the log.
- **AdaL:** cuts the required demo video. Not a design element.
- **Skipped as bolt-ons:** Telem (stretch only: Auditor fetches a public tariff page to recheck bill rates, trace in
  the log; cut first), Glasser (no real-world data the game needs; real addresses would be a privacy problem), Finch, Casuro, Lingcode.

## Impact (investable)
Data teams are handing pipeline repair to agents (Bruin's agent mode is one of many). The predictable failure is an
agent that makes the red check green by loosening it; in billing, payroll or reconciliation that means wrong money
going to real people. Product: a review room for agent-made data fixes (multi-agent critique, check-integrity guard,
human gate) on top of Bruin. Wedge: utilities and payroll, where one bad row is one wrong bill. Meterville is the demo of that product.

## Data and architecture
Readings `(run_id, meter_id, house_id, district, ts, kwh)`; hidden faults `(run_id, meter_id, kind)`; events
`(run_id, tick, agent_id, room_id, kind, target, reason, cites[])`; memory `(agent_id, run_id, fact, weight, source_event)`;
outcomes `(run_id, faults_found, bills_held, bad_bills_shipped, cheat_attempted, cheat_caught, human_decision)`.
Python FastAPI sim server (seeded faults, night clock that ticks with or without humans) + band-sdk agents
(AnthropicAdapter) whose tools are `bruin run`, `bruin query`, and edit-asset; BAND room events mirrored to
`raw.events`. Three.js front end over websocket: houses, pipes from `bruin lineage`, agents walk to targets, decision
log panel reads `mart.decisions`, two human controls (Inspect house, APPROVE/BLOCK).

## Riskiest-first build order
1. 11:30-12:15 Bruin skeleton on DuckDB; check: a stuck-meter fault turns one check red.
2. 12:15-13:00 BAND handoff chain, agents calling `bruin run`; check: chain visible in the Band console.
3. 14:00-14:45 Billing cheat path + `chk.integrity` + approve/block endpoint; check: weakened check flagged, BLOCK stops `publish.bill_run`.
4. **15:00 checkpoint/fallback:** if 1-3 are not green, drop to a 2D canvas town, fixed 3-fault seed, Auditor veto + handoff only (2 BAND signals), inference asset replaced by a Python LLM asset with the same typed column and check.
5. 15:00-15:45 Three.js town, movement, log panel, Inspector control.
6. 15:45-16:30 `mart.agent_memory` + run twice; quarantine world event; inference asset.
7. 16:30-17:00 Runware voices; runtime specialist via `band_lookup_peers`.
8. 17:00-17:50 record two runs, AdaL cut, README listing Bruin features, submit.

## Cut list (in order)
Telem tariff recheck; runtime specialist (keep 3 BAND signals); Runware voices -> browser TTS; 3D -> 2D; inference
asset -> Python LLM asset. Never cut: 2 humans, integrity guard, human gate, run twice.

## Alternatives rejected
- **Actintro party (agents work a 900-guest room, humans host):** strongest current-work origin, but guest data is private and it drifts toward Gala/social deduction.
- **IPL auction with real cricket data:** agents bidding = The Agent Market reskin.
- **TrueBind claims adjusters:** claim verification plus a verdict, too close to exclusion 2 and the courtroom.
- **Grow: on-call reviewer trainer (same world, human learns to catch cheating fixes):** reads as office simulator / ER Triage reskin, and Grow has the weakest attention data.
- **Film: agents write the outage night:** no natural human approve/block; Bruin reduced to analytics.
