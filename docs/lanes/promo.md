# Promo lane: wrestler promos written from Bruin memory

Goal: TV-style promos (pre-match, mid-match trash talk, post-match) written live by each wrestler agent, quoting what
its Bruin memory says about the opponent, and shown as a broadcast lower-third.

## What shipped (branch `lane/promo`)
| File | What |
|---|---|
| `agents/promo/promo.py` | Reads memory via `agents.memory.Memory` and turns rows into facts. Makes one OpenAI call per speaker, in parallel, with a 2.5 s timeout. Validates speakers, line count, word limit and cites. Falls back to a gimmick template per speaker. |
| `agents/promo/__main__.py` | `python3 -m agents.promo`, a stdlib server on `:8789` (`HEEL_PROMO_PORT`) with CORS open. `POST /promo`, `GET /health`. |
| `agents/promo/test_promo.py` | 6 offline tests (fallback cites, mid line length, post order, invented cite rejected, clipping, bad moment). |
| `agents/promo/run5.py` | Five promos end to end over HTTP, with latency. |
| `agents/promo/dom_check.mjs` | Runs the real `promo.js` under jsdom against the live server and asserts what the player sees. |
| `agents/promo/render.mjs` | Headless Chromium screenshots. Not runnable on this VM (see Not verified). |
| `game/ui/promo.js`, `game/ui/promo.css` | Lower-third overlay: portrait, name, typed-on line, "Memory" chips with the quoted facts, Enter to skip, Esc to close, `speak()` hook. |

Contract: `POST /promo {moment: "pre"|"mid"|"post", speaker, opponent, match_state}` returns
`{lines: [{speaker, name, text, cites, facts}], meta: {source: openai|fallback|mixed, model, memory, ms, error?}}`.
- `pre`: speaker's 3 lines, then opponent's 3 lines, at most 22 words each.
- `mid`: 1 line from speaker, at most 12 words.
- `post`: winner 2 lines, then loser 2 lines. The winner is `match_state.winner`, else `speaker`.
- `match_state` keys, all optional: `players` {wrestler_id: "p1"}, `names`, `match`, `finish`, `event`, `seed`.
- `cites` are `agents.memory.cite()` ids. An LLM speaker whose lines cite no real row of its own memory falls back.
- Memory read per promo: `relationships` (grudge/trust/last_betrayal, both directions), `habits` (opponent, or the human
  in `players`), `ref_ledger` (opponent's accepted bribes), `leaderboard` (both), `partner_trust` (speaker's).

## VERIFIED
**Unit tests** `python3 -m unittest agents.promo.test_promo` -> `Ran 6 tests in 0.003s OK`.

**Five promos, real key** `python3 -m agents.promo.run5` (gpt-4o-mini, memory=stub fixtures, HTTP through the real handler):
```
[pre] mae vs silas  source=mixed server_ms=2583 error=silas: TimeoutError
  Old Iron Mae: Silas, I've seen your tricks, but remember last time you cheap-shotted me behind Lou's back?  cites=['relationships.mae>silas']
  Old Iron Mae: You may have your three wins, but I've got five and eleven eliminations to your name!  cites=['leaderboard.mae', 'leaderboard.silas']
  Old Iron Mae: It's time to show you what a true veteran can do when the bell rings.  cites=['relationships.mae>silas']
  Silas Crane: Mae, friend, everyone has a price. I already know yours.  cites=[]
  Silas Crane: Still crying about M9, Mae? I low-blowed you behind Lou. I'd do it again.  cites=['relationships.mae>silas']   <- template fallback
  Silas Crane: Shake my hand tonight. Watch your back after.  cites=[]
[pre] vex vs kane  source=openai server_ms=2185
  Vex: You picked strike 14 times, but I've got the moves to dodge your weak shots!  cites=['habits.p1/opening/strike']
  Vex: Hope you're ready to grapple, because I'm about to turn this ring into my playground!  cites=['habits.p1/after_block/grapple']
  Brutus Kane: Vex, you think you're clever? Caught bribing Lou in m11, everyone knows you're a fraud.  cites=['ref_ledger.lou/m11']
  Brutus Kane: Four wins and fourteen eliminations. I'm not here to play games; I'm here to dominate.  cites=['leaderboard.kane']
  (+2 lines)
[mid] kane vs vex  source=openai server_ms=1036
  Brutus Kane: You think 2 wins matter? I've got 4 to crush you.  cites=['leaderboard.kane', 'leaderboard.vex']
[post] silas vs vex (winner silas)  source=openai server_ms=2047
  Silas Crane: Vex, I hope you enjoyed the taste of that pin. After all, you stole one from me before. How sweet is revenge?  cites=['relationships.silas>vex']
  Vex: Silas, you only won because Lou was on your payroll in match ten! Everyone knows it!  cites=['ref_ledger.lou/m10']
  Vex: But mark my words, I'll steal back my spotlight and settle the score! You won't see me coming!  cites=['relationships.silas>vex']
  (+1 line)
[post] mae vs silas (winner mae)  source=openai server_ms=2078
  Old Iron Mae: Silas, you thought you could low-blow your way to victory, just like in match 10 when you bribed Lou. Wrong move, buddy.  cites=['relationships.mae>silas', 'ref_ledger.lou/m10']
  Silas Crane: Mae, you may have tossed me tonight, but remember, I held you down with a low blow back in m9.  cites=['relationships.mae>silas']
  (+2 lines)
wall ms: min 1037  median 2080  max 2585  (n=5)
```
(Two long dashes in model output are shown as periods here. The full lines print in the command output.)

**Latency (measured, n=5, plus 3 earlier runs that agree).** A one-line mid call takes about 1.0 s. A two-speaker promo takes
2.0 to 2.6 s because both speakers run in parallel, each with its own 2.5 s budget. A 3-line pre-match speaker sometimes
hits the timeout (1 of 10 speakers in this run, 1 of 10 in the run before). That speaker alone falls back to its
template and the other speaker keeps its LLM lines (`source=mixed`). The first design wrote all speakers in one call. It
timed out on 4 of 5 promos, so it was replaced.

**Overlay** `node agents/promo/dom_check.mjs /tmp/pw/node_modules/jsdom` (real `promo.js`, live server, real key):
```
[pre] vex vs kane: overlay visible after 2655 ms, source=mixed (vex: TimeoutError); typing mid-line: "Ca"
  [left] Vex (/art/portrait-vex.jpg): You threw the same strike 14 times in the opening, Kane. I noticed.  | memory: Brutus Kane picked strike 14 times when opening (64%)
  [right] Brutus Kane (/art/portrait-kane.jpg): Vex, you bribed Lou and got caught. That's a low move, even for you.  | memory: Vex paid referee Lou in m11, and got caught
  ...
[mid] mae vs silas: overlay visible after 1265 ms, source=openai; typing mid-line: "I'v"
  [left] Old Iron Mae (/art/portrait-mae.jpg): I've seen better tricks from your seven betrayals, Silas.  | memory: grudge 0.8, ...; Silas Crane: 3 wins, 6 eliminations, 7 betrayals
speak() called 7 times; all assertions passed
```
Asserted: one card per line, and Enter finishes typing then advances. The text types on. Each card shows the speaker's
portrait path. Pre-match speakers sit on opposite sides. Memory chips render. `speak()` fires once per line.

## NOT verified
- **Pixels.** Headless Chromium downloads but cannot start on this VM. `libnspr4.so` is missing and apt is not allowed,
  the same blocker the ladder and voice lanes hit. No screenshot exists. The layout, slash frame and fonts are unseen.
  `node agents/promo/render.mjs docs/lanes <playwright path>` writes `promo-typing.png`, `promo-line1.png` and
  `promo-right.png` on any machine where Chromium starts.
- **Live Bruin marts.** Every run used `memory=stub` (`agents/fixtures/marts.json`). With `HEEL_BRUIN_DUCKDB` set, the
  same `Memory` class reads the marts. Not exercised here.
- **Voice.** The `speak` hook is exercised with a fake. Runware and speechSynthesis through `voice/tts.js` are untested.
- **Design stack.** None of the CLAUDE.md design skills (gstack, ui-ux-pro-max, taste-core, taste-redesign, impeccable,
  emil-design-eng, frontend-design) is installed on this VM, so none was read. The overlay reuses menu.css's broadcast
  tokens: red/gold/ink, Anton names, -14deg slashes, `--ease-out`, plus prefers-reduced-motion and a narrow-screen layout.
- **Leftover process.** render.mjs's first run (Chromium failed) left a `python3 -m agents.promo` on :8789 because the
  launch threw before its `try`. That is fixed in the committed script. Killing the orphan needed approval I could not get here.

## How main.js / menu.js should call it
1. Start the service next to the agents server: `python3 -m agents.promo` (port 8789, reads `OPENAI_API_KEY`).
2. In main.js:
```js
import { createPromo } from './ui/promo.js';
import './ui/promo.css';                      // or a <link> in index.html
const promo = createPromo({
  base: 'http://127.0.0.1:8789',              // promo server
  art: '/art',                                // game/public/art is served at /art
  speak: tts?.speak,                          // optional: createTTS().speak from voice/tts.js; omit for silent text
});
// match_state.players maps the human's wrestler to its habits id, so opponents can quote the human's habits.
const ms = { match: matchId, players: { [humanWrestlerId]: 'p1' } };

// PRE: fetch during the entrance (about 2.5 s), show when the intro ends.
const pre = promo.fetchLines({ moment: 'pre', speaker: a, opponent: b, match_state: ms }).catch(() => null);
// ...at end of entrance:
const p = await pre; if (p) await promo.show(p.lines, 'pre');

// MID: on knockdown or near-fall. Do not await, and rate-limit (one per ~8 s).
promo.play({ moment: 'mid', speaker: attacker, opponent: downed, match_state: { ...ms, event: 'near_fall' } });

// POST: after the bell.
await promo.play({ moment: 'post', speaker: winner, opponent: loser, match_state: { ...ms, winner, finish: 'pin' } });
```
- `play()` never throws. If the service is down it logs `[promo] skipped` and returns null. `fetchLines()` throws, so catch it.
- While a card is up, the overlay captures Enter and Esc (capture phase, `stopImmediatePropagation`). menu.js does not
  need changes. Its Enter handlers simply do not fire during a promo.
- `promo.close()` ends a promo early (for example when the next round starts). `promo.destroy()` removes the overlay.
