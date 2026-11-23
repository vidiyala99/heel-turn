# Lane: bruin (game memory pipeline)

Goal: events -> checked tables -> marts the wrestlers read before every plan, on Bruin + DuckDB
(finish line item 6). Everything lives in `bruin/`. The README there has the "Bruin Features Used"
table.

## Verified (2026-11-23, bruin 0.11.832, OPENAI_API_KEY set)

| Claim | Command | Output |
| --- | --- | --- |
| Pipeline green, inference included | `bash bruin/run.sh` | `✓ Assets executed 8 succeeded` / `✓ Quality checks 40 succeeded`, 3.2 s cold |
| Without the key it skips inference | `bruin run --exclude-tag inference .` (what run.sh does with no key) | `7 succeeded` / `37 succeeded` |
| Planted bad row blocks the marts | `bash bruin/prove_bad_row.sh` | `PASS staging.stg_events F.FF.....F.`, then `UPSTREAM FAILED` for all 5 marts. kind, situation, event_id.unique and the roster custom check fail. Exit 1. Green again once the row is removed. Full output: [bruin-checks.txt](bruin-checks.txt) |
| Custom mart checks fire | same script, tamper step | `habit share is a proportion ... returned 1 instead of the expected 0`, `relationships only name known wrestlers ... returned 2` |
| Inference labels taunts | `bruin query ... marts.taunt_tone JOIN stg_events` | 11 rows. "Trust is for people who lose." -> heel. "Come on, crowd, let me hear you!" -> face |
| Lineage + column lineage | `python3 bruin/lineage.py` | [bruin-lineage.txt](bruin-lineage.txt) |
| Wrestler queries | `bash bruin/query_examples.sh` | [bruin-queries.txt](bruin-queries.txt). e.g. counter_pick p1/after_block -> expect grapple 0.5, counter strike |
| Node API works | `node --input-type=module -e "...refreshMemory()"` | `true`, 2170 ms (inference results cached) |
| Grudge shows in memory | `feelings_of me=brutus` | `silas  trust 0.15  grudge 3  last_betrayal m2` |

## Not verified / caveats

- Fixtures only. No live game event has gone through the pipeline yet.
- `counter_rate` in the fixtures rises m1 -> m4 for p2 (0.29 -> 1.0) because the generator is
  scripted to do that. Samples are 4 to 14 moves per cell, so it proves the SQL, not learning.
- Reading during a refresh worked once (`ask()` 700 ms into `refreshMemory()`). DuckDB allows a
  single writer, so concurrent access is not proven safe. Refresh between matches, not mid-plan.
- Bruin writes run logs to the repo-root `logs/` (untracked, not committed) and appends
  `logs/`, `__pycache__/` lines to the repo-root `.gitignore` on runs. I reverted that each time
  because the file is outside this lane, so whoever owns it may want to add them. It also appends
  `.bruin.yml` to `bruin/.gitignore` on each run. The file stays tracked and holds only the
  `${OPENAI_API_KEY}` placeholder.
- The inference model is `gpt-4o-mini`. Latency was not measured separately (about 2 s for 9 calls,
  inside the run).

## How main.js / the server should call it

1. **Emit events.** Append one JSON line per event to `bruin/data/events.jsonl`. Use the PLAN
   schema plus a unique `event_id` (suggested `${match}-${seq}`; md5 of match|t_ms|actor|kind|target is
   derived if missing):
   `{"event_id":"m7-0042","match":"m7","t_ms":51234,"actor":"p1","kind":"strike","target":"vex","situation":"opening","success":true}`
   `actor`/`target` must be roster ids from `bruin/assets/seeds/wrestlers.csv` (p1, p2, vex, brutus,
   silas, mae, lou, booth). An unknown id fails the roster check and blocks the refresh, so add new
   entrants to the CSV first. `situation` is required on every event.
2. **Refresh memory** after each match (node only):
   ```js
   import { refreshMemory, ask } from '../bruin/memory.mjs';
   const ok = await refreshMemory();            // false = a check failed; last good marts remain
   ```
3. **Before each plan**, query and paste the rows' `cite` into the decision log:
   ```js
   await ask('counter_pick', { player: 'p1', situation: 'opening' }); // [{expect, share, counter, cite}]
   await ask('habits_for',   { player: 'p1', situation: 'opening' }); // [{move, n, share, cite}]
   await ask('feelings_of',  { me: 'brutus' });                        // [{about, trust, grudge, last_betrayal, cite}]
   await ask('leaderboard');                                           // [{display_name, wins, eliminations, betrayals}]
   ```
   Each `ask` shells out to `bruin query`. Five sequential calls took 339, 440, 300, 471 and 466 ms
   (measured). Memory only changes between matches, so fetch once per wrestler per match and cache.
