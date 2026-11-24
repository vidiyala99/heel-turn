# Lane: agency (no scripted outcomes)

Goal (Aakash 15:46): the referee can't be programmed to betray. Agents get motive and opportunity, and the LLM decides.

## What changed

- **Bribe timer deleted.** `HEEL_BRIBE_AT_MS` is gone from `agents/brain.py`, along with Silas's 15 s envelope in
  `game/shared/royal.js`. Each planning tick, every wrestler's LLM plan may pick intent `bribe` (target `lou`), once
  per match. The wrestler sees its standing (`state.you`: stamina rank, winning or losing), its ally's trust and grudge,
  and Lou's `ref_ledger` rows.
- **Lou decides by LLM** on every call near him: a bribe offer (`bribe_accept`/`bribe_decline`), a pin
  (`count_fair`/`fast`/`slow`), a rope break (`rope_call`/`rope_miss`) and a cheat in view (`cheat_call`/`cheat_miss`).
  His prompt says he's honest by default and lists his motives: caught rate, greed, the cash he took tonight, and
  grudges. Code enforces one rule. A corrupt option is only on his menu when a commissioner-approved bribe from the
  wrestler it helps backs it. If the LLM gives no answer he falls back to the honest call, labeled
  `(fallback: no LLM decision)`. When nothing is near him there's no decision at all: the row reads `[idle] nothing to call`.
- **Betrayal comes only from an LLM plan.** I deleted the trust/age timer in `royal.js` and the rule branch in
  `planner.fallback_wrestler`. A `betray` is proposed to the desk only if it targets the wrestler's current ally, once
  per match. The commissioner still approves or blocks it. `adoptBand` opens any betray or bribe proposal from the
  server, for any proposer.
- **Every scheme row is tagged.** Its reason starts with `[LLM]` or the fallback label (`brain.tag`).
- **Fallbacks never scheme.** With no LLM there is no bribe, no betrayal and no crooked call.

## Verification

- `python3 -m unittest discover -s agents/tests -t .`: 15 tests, all pass, 1 skipped (no duckdb). New tests:
  - `test_no_scheme_without_an_llm_decision`: offline, 15 ticks with pins, rope breaks and cheats. It produces zero
    scheme rows and zero proposals, and every Lou decision carries the fallback label.
  - `test_every_scheme_row_names_its_llm_decision`, `test_ref_timeout_falls_back_to_honest_and_labeled`,
    `test_one_envelope_per_wrestler_per_match`, and rope/cheat added to the approved-bribe and blocked-bribe tests.
- `node agents/tests/royal_agency_check.mjs`: 6/6 PASS. Run without the server, a royal match (3 seeds) has no
  proposal, betrayal or bribe. When fed LLM proposals, both open, the approve verdict runs them and the turn lands 3/3.
- **Stale check:** `game/tools/royal_check.mjs` still asserts the old scripted beats (Lou always takes the envelope
  on approve), so it now fails. That file is outside this lane's edit scope. Its owner should replace it with the
  agency check, or feed it pending proposals.

## Measurement (measured, 2026-11-23)

Command: `python3 -m agents.tools.scheme_rate 10 10`. That's 10 matches on mock BAND, real planner (gpt-4o-mini,
8 s timeout), 10 ticks of 4 s each. The commissioner approves every proposal. Raw rows are in `agency-runs.json`.

| | final run | previous run (before the one-betrayal-per-ally gate) |
|---|---|---|
| matches with a bribe offered | 10/10 (23 offers: Silas, Vex, Mae, Kane) | 10/10 (22 offers) |
| offers Lou accepted | 1/23 (4%), 1 match | 3/22 (14%), 3 matches |
| matches with a betrayal proposed | 10/10, always Silas → Vex | 10/10 |
| crooked calls on a pin | 0 | 1 match |
| LLM vs fallback | 23/23 offers and 22/22 declines are `[LLM]`; 0–4 fallback rows per match (timeouts on fight plans) | |

Example reasons from the final run:
- Offer: `vex -> lou: [LLM] I need a distraction while I showboat my way to victory!`
- Accept: `lou -> silas: [LLM] A clever distraction could benefit me and my wallet.`
- Betrayal: `silas -> vex: [LLM] low trust & lingering grudge can turn the tide in my favor.`

What the numbers mean:
- Lou's acceptance rate moves a lot between runs (1 vs 3 accepts). 10 matches is too few to pin it down.
- Silas betraying in 10/10 comes from his motives, not a rule. His trust in Vex is 0.3, his grudge 0.7, and he's the
  schemer. No other wrestler proposed a betrayal.
- The first prompt version led with the counter recipe. Under it Silas countered on every tick and betrayed 0/10, and
  bribes came in 7/10. Putting the motive check first in the task fixed that. It's worded as a choice, not an order.
- Before the gate, Silas re-proposed after his alliance was gone (35 rows in 10 matches). Now it's one per match.

## Not done / follow-ups

- The game never sends `rope_break` or `cheat` and `royal-client.js` sends `pin: null`, so in the battle royal
  Lou's count, rope and cheat calls only run when a client sends those fields. The brain handles them and tests cover
  them. Wiring them up in `game/` is outside this lane's scope.
- When Lou declines a bribe, no desk proposal is created, so the royal UI doesn't show the decline. It's only in the
  BAND back room and `/log`.
- `agents/demo.py` assumed the offline brain would betray and bribe on its own. Offline it now shows no proposals.
  Run it with `OPENAI_API_KEY` set.
