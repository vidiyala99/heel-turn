# Lane: odds (fan-points betting tracker + live prop polls)

PLAY MONEY ONLY. Fan points have no cash value, cannot be bought, sold or withdrawn. There is no
payment code anywhere. Every fan starts at 1000 points; stakes are 1 to 500 per ticket.

## Files (all new)

| Path | What |
| --- | --- |
| `bruin/assets/marts/raw_ref_ledger.py` | `raw.ref_ledger`: Lou's envelopes. Reads `bruin/data/ref_ledger.jsonl`, falls back to `agents/odds/fixtures/ref_ledger.jsonl`. Override with `HEEL_TURN_REF_LEDGER` |
| `bruin/assets/marts/raw_bets.py` | `raw.bets`: bet + result lines. Reads `bruin/data/bets.jsonl`, falls back to `agents/odds/fixtures/bets.jsonl`. Override with `HEEL_TURN_BETS` |
| `bruin/assets/marts/ref_ledger.sql` | `marts.ref_ledger(ref, briber, offers, accepted, caught, take_rate, caught_rate)`: Laplace-smoothed take rate, per briber plus `_any` |
| `bruin/assets/marts/odds.sql` | `marts.odds(match_id, wrestler, win_prob, line, decimal_odds, rating, predictability, heat, ref_edge)` built from leaderboard + habits + relationships + ref_ledger. Covers every card in the events plus `next` (the full roster) |
| `bruin/assets/marts/props.sql` | `marts.props(match_id, prop, prob)`: `envelope` (Lou takes it), `turn_<w>`, `heel_turn` (anyone turns), `kipup` |
| `bruin/assets/marts/fan_ledger.sql` | `marts.fan_ledger(bet_id, fan_id, match, market, pick, stake, decimal_odds, status, payout)` |
| `bruin/assets/marts/requirements.txt` | pandas for the two Python assets |
| `agents/odds/book.py`, `__main__.py` | HTTP service on :8790 (stdlib only) |
| `agents/odds/demo.py` | Scripted end-to-end run |
| `agents/odds/shot.mjs` | Panel screenshot script (not run here, see below) |
| `game/ui/odds.js`, `game/ui/odds.css` | Spectator side panel |

The two raw assets live in `marts/` because the brief allowed new files only there. Their asset
names are still `raw.*`.

## Verified (2026-11-23, bruin 0.11.832, OPENAI_API_KEY set)

| Claim | Command | Output |
| --- | --- | --- |
| Pipeline green with the new marts | `bash bruin/run.sh` | `PASS marts.odds ..............` `PASS marts.props ......` `PASS marts.fan_ledger .............` `PASS marts.ref_ledger ..........`, then `✓ Assets executed 14 succeeded` / `✓ Quality checks 83 succeeded`. Before this lane it was 8 / 40 |
| Probabilities are in [0,1] and each match sums to 1 | the same run | `win_prob` min/max/not_null checks plus the custom check `win probabilities sum to 1 per match` pass. `props.prob` checks [0,1]. The demo prints `sum(win_prob)=1.0000` |
| End to end: seed, bet, vote, resolve, pay out, Bruin agrees | `python3 -m agents.odds.demo` | Full output: [odds-demo-output.txt](odds-demo-output.txt). Highlights below |
| 1-tap bets lock the price; refusals are explicit | demo step 3 | `fan_bo winner silas 100 -> 200 locked x5.29`, `vex 5000 -> 400 stake must be a whole number of fan points from 1 to 500`, `hulk 10 -> 400 hulk is not on the m5 card`, repeat vote -> `400 one vote per fan per poll` |
| Polls resolve from match events | demo step 4 | `lou bribe_accept silas SETTLED envelope=yes`, `mae kipup SETTLED kipup=kipup`, `silas betray brutus SETTLED turn_silas=yes`, last elimination -> `SETTLED winner=silas` |
| Payouts | demo step 5 | `fan_bo balance 1189` (100 on Silas at x5.29 -> 529), `fan_cy 999`, `fan_ana 994` |
| Service balances equal the Bruin ledger | demo step 5 | `fan_ana: service balance 994 == 1000 + bruin net -6: True` (and the same for fan_bo and fan_cy) |
| Lineage: a bribe the service saw reaches the Bruin marts | demo step 5 | `marts.ref_ledger lou: _any offers 4 accepted 3 take_rate 0.667` (the fixture had 3 offers) |
| A wrong payout is blocked | demo step 6 (m5 winner result rewritten to vex) | `FAIL`: `winner results agree with the match events custom check ... has returned 1 instead of the expected 0`, `bruin run completed with failures`, exit 1 |
| Panel JS parses | `node --check game/ui/odds.js` | no output, exit 0 |

Lineage: `raw.events -> staging.stg_events -> marts.{leaderboard, habits, relationships}`, then
`raw.ref_ledger -> marts.ref_ledger`. All of those feed `marts.odds -> marts.props`. Separately,
`raw.bets + staging.stg_events -> marts.fan_ledger`. All of it is declared in `depends:`, so
`python3 bruin/lineage.py` and `bruin lineage` pick it up.

## Not verified

- **The panel was never rendered.** This VM has no Playwright browser (`node agents/odds/shot.mjs`
  failed with `Cannot find module .../@playwright/mcp/node_modules/playwright`). The script is
  ready for a machine that has the browser: run `python3 -m agents.odds.demo` first, then
  `node agents/odds/shot.mjs`. It writes `docs/shots/odds-live.png` and `odds-settled.png`.
- **CLAUDE.md design stack.** gstack, ui-ux-pro-max, taste-core, taste-redesign, impeccable,
  emil-design-eng and frontend-design are not installed on this VM (searched `/home/node`), so I
  could not load them. The panel reuses `menu.css` tokens instead: red/gold/ink, Anton, -14deg
  slashes, `--ease-out`, gold focus rings, press-scale on `:active`, and reduced motion. It needs a
  visual pass with those skills.
- The odds formula is a hand-set heuristic, not fitted to anything. Its inputs come from 4 fixture
  matches.
- No live game events have been tested. The agents server does not write `ref_ledger.jsonl` yet.
  Right now only the odds service writes it, when it sees `bribe_accept` / `bribe_decline`.
- Poll votes live in memory only and are lost on restart. Bets and results are replayed from
  `bets.jsonl`.
- Bruin cannot refresh while a match is in progress. The existing check
  `marts.leaderboard: one winner per match` fails while a match has several fighters still
  standing. That is why the service prices a live card from `next`, renormalized over the
  entrants. Run `bash bruin/run.sh` between matches, then `POST /refresh`.
- `bruin/data/bets.jsonl` and `bruin/data/ref_ledger.jsonl` are not covered by `bruin/.gitignore`
  (another lane owns that file). Its owner should add both. Bruin also keeps appending lines to
  the root `.gitignore`; I reverted them each time.

## How to wire it

**Server side** (whoever owns `game/server/` or the agents server):

```bash
python3 -m agents.odds        # :8790, HEEL_ODDS_PORT / HEEL_ODDS_DIR (default bruin/data) to override
```

Forward every match event to `POST /event`. A single event or an array both work, in the same
shape as `bruin/data/events.jsonl`. The service also understands four kinds the Bruin vocabulary
does not have, and these must NOT be written to `events.jsonl`, because `stg_events` would reject
them:

- `{"kind": "bribe_accept" | "bribe_decline", "actor": "lou", "target": "<briber>"}` (from
  `brain._bribe`)
- `{"kind": "kipup", "actor": "<downed wrestler>"}`
- `{"kind": "match_end", "winner": "<id>"}` (optional; the last elimination already settles the
  match)

`entry` events must arrive before the board is shown, so the card is known. After each match, run
`bash bruin/run.sh`, then `POST /refresh`.

**main.js** (spectator view):

```js
import { mountOdds } from './ui/odds.js';   // + <link rel="stylesheet" href="ui/odds.css"> in index.html
const odds = mountOdds(document.body, { match: matchId });   // fan id auto-generated + kept in localStorage
// on a new match:  odds.setMatch(newMatchId)
// hide for players, show for spectators:  odds.show(isSpectator)
// teardown:  odds.destroy()
```

Options: `api` (default `http://<host>:8790`), `fan`, `pollMs` (1500), `chips` ([25, 50, 100]).
The panel is `position: fixed` at the right edge with z-index 20, above `#ui` (10). Below 720 px
it becomes a bottom sheet.

**menu.js**: optional. A "Spectate" item can call `odds.show(true)`. No other hooks are needed.

API reference: the docstring at the top of `agents/odds/__main__.py`.
