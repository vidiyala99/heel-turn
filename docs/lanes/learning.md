# Lane: learning proof (finish line item 3)

Goal: show whether the AI counters a human's habits better when it remembers them across matches. Metric declared in
docs/PLAN.md before the run: counter rate = share of the human's moves that the AI met with the move that beats it
(block beats strike, strike beats grapple, grapple beats block), per match. Memory ON vs OFF, same seeds.

## Files
- `learning/batch.mjs`: headless matches on `game/shared/sim.js` (unedited). Bot humans in slot 0, AI (Mae) in slot 1.
  Memory ON carries `m.habits` into the next `createMatch`, as the Bruin habits mart would. Memory OFF passes `null`.
- `learning/results.csv`: one row per match (32000 rows).
- `learning/chart.mjs`: `docs/learning/counter-rate.svg` and `docs/learning/summary.json`.
- `learning/llm_check.mjs`: LLM planner spot check, writes `docs/learning/llm-spot-check.json`.

"Met with" means the AI move start nearest in time to the human's move start, within -0.3 s to +0.5 s. A human move
with no AI move in that window counts as not countered. Every human move is in the denominator.

## Personas (habits are probabilities of strike/grapple/block, 10% of picks uniform noise)
- striker: 70% strike on opening, 60% strike when cornered, 60% block when gassed.
- turtle: 55% block on opening, 80% block in the 1.5 s after being hit. The AI does not model "after being hit".
- grappler: 65% grapple on opening, 75% when cornered.
- switcher: striker for matches 1-10, grappler for matches 11-20 of each series.

## VERIFIED

`node learning/batch.mjs --reps 200 --series 20` (55 s wall):
```
32000 matches (200 series x 20 matches x 4 personas x 2 conditions) -> learning/results.csv in 54.6 s
```
N = 200 independent series x 20 matches = 4000 matches per persona per condition. 198 matches (0.6%) end in about 5 s
with an AI win before the bot moves. They have no counter rate and are excluded.

`node learning/chart.mjs` (matches 2-20; match 1 has no memory in either condition). CIs are 95%. The ON-OFF
difference is paired by series and averaged per series, so the CI counts 200 series, not 3800 correlated matches.

| persona | OFF | ON | ON - OFF | ON - OFF, engaged moves only | shuffle chance |
|---|---|---|---|---|---|
| striker | 46.7% ± 0.5 | 49.2% ± 0.5 | **+2.5 pp ± 0.4** | +1.9 pp ± 0.5 | 31.1% |
| turtle | 38.6% ± 0.5 | 39.9% ± 0.5 | **+1.3 pp ± 0.5** | +2.3 pp ± 0.7 | 26.5% |
| grappler | 48.5% ± 0.5 | 49.4% ± 0.5 | **+0.9 pp ± 0.4** | +1.1 pp ± 0.5 | 35.7% |
| switcher | 47.8% ± 0.5 | 49.5% ± 0.5 | **+1.7 pp ± 0.5** | +0.2 pp ± 0.6 | 33.6% |

Switcher, ON - OFF: before the switch +2.6 pp ± 0.7. First 3 matches after it +0.9 pp ± 1.5. Last 3 +0.3 pp ± 1.3.
AI win rate, switcher: OFF 42.3% ± 1.6, ON 47.2% ± 1.6. Other personas show no win-rate change beyond the CI.

## Readout
- **Memory helps, a little, for every persona.** The lines separate by 1 to 2.5 points. All four CIs exclude zero.
  Largest against the striker, whose habit is the strongest and sits in the most common situation (opening).
- **Most of the countering is not memory.** With memory OFF the AI already sits 12 to 16 points above shuffle chance.
  That gap is the reactive layer in `shared/ai.js`, which reads the human's wind-up and answers it whatever the habits
  say. Memory only shifts which answer that layer prefers.
- **Adaptation.** After the switch, memory ON's edge drops to zero within the CI and stays there for the last 10
  matches. Stale striker counts did not measurably hurt, but ON gained nothing back either. The habit counts never
  decay, so ten matches of strikes keep outvoting the new grapples (inferred from `normHabits`/`recordHabit`, which
  only add).
- **Switcher caveat.** Its +1.7 pp disappears on engaged moves only (+0.2 ± 0.6). Memory there changed how often the
  AI engaged, not how well it read the move.

## Explaining the number
- **Not a random-baseline artifact.** Chance is not 1/3 here. The shuffle baseline deals the AI's own engaged answers
  at random within each match, times the engaged share. Measured 26.5% to 35.7%. Both lines sit far above it.
- **Same seeds.** Match 1 of every series is byte-identical in both conditions (checked in the smoke CSV, e.g. striker
  rep 0 match 1: 14 moves, 5 countered, in both).
- **Not an engagement artifact** for striker, turtle and grappler. The engaged-only rate shows the same sign and size.
  It is for the switcher (see above).
- **Not correlated-sample inflation.** CIs come from per-series means.
- **What limits it.** Inferred from code, not profiled: (1) memory OFF relearns inside each match from about 19 human
  moves, and the scripted planner only needs 3 moves per situation before it plans, so OFF catches up within seconds.
  (2) The first plan comes 3 s after the bell, then every 3.5 s, so carried habits cannot act at the opening exchange.
  (3) `expect` only changes the block chance on a read strike (0.45 to 0.85) and the attack mix. Grapple reads are
  answered with a strike 70% of the time whatever memory says. Changing those is a sim change, owned by another lane.
- **Bot humans, not people.** The size of the effect depends on how habit-bound the personas are. Real players may be
  more or less predictable.

## LLM planner spot check (SMALL N, not the proof)
`node learning/llm_check.mjs --matches 10` spawns `python3 -m agents.server` on a free port with `HEEL_BAND_MODE=mock`,
posts `/plan` every 4 s of match time as `game/agent-layer.js` does, and applies each plan as `m.extPlan` once the
measured round trip has passed in match time. Same 10 seeds, memory OFF both arms. Output:
```
"excluded_zero_move_matches": 2, "plan_sources": { "openai": 154 }, "errors": [],
"counting": { "mean": 0.396, "ci95": 0.059, "n": 9 },
"llm":      { "mean": 0.499, "ci95": 0.06,  "n": 9 },
"llm_minus_counting_paired": { "mean": 0.103, "ci95": 0.066, "n": 9 },
"plan_latency_ms": { "n": 154, "p50": 1188, "p90": 1579, "max": 2523 }
```
Every plan came from OpenAI (154 of 154, no fallback). The LLM arm countered about 10 points more, n = 9 pairs.
Likely cause, untested: the LLM picks `counter` with an expected move on thin evidence, while the counting model
waits for a share above 45%. Confounds: the server also shows the LLM its Bruin marts for `p1` (a real player's
rows), and one earlier 10-match run gave +9.0 pp ± 5.3, so the sign held but the size is loose.

## NOT verified
- No PNG. ImageMagick `convert` needs an approval this headless session cannot give, and cairosvg is not installed.
  Run `convert -density 150 docs/learning/counter-rate.svg docs/learning/counter-rate.png` locally.
- The SVG was not opened in a viewer. Layout was sized by arithmetic only. It needs a local look and an impeccable
  pass before it goes on a slide (CLAUDE.md: visual work is finished locally).
- Not pushed. `git push` needs an approval this session cannot give. Commits are on local `lane/learning`.

## How main.js should use this
It does not call it at runtime. The chart and numbers are offline artifacts for the demo and the README. To rerun:
`node learning/batch.mjs --reps 200 --series 20 && node learning/chart.mjs`. To score a live match the same way,
import `score(log)` from `learning/batch.mjs` with a log of `{ i: slot, t: seconds, move }` move starts.
