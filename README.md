# HEEL TURN

**AI wrestlers that remember how you fight.** A 3D browser wrestling game where two humans and four LLM wrestlers share
one ring. The wrestlers read your habits out of a Bruin pipeline, plot alliances and betrayals in private BAND rooms,
and a human commissioner approves or blocks every heel turn.

Track 02, Co-op Multiplayer Game. Sponsors used: Bruin, BAND, Runware, AdaL.

## Screenshots

Every file below is already in `docs/shots/`.

| Slot | File | Shows |
|---|---|---|
| Title | `ui-title.png` | title screen |
| Select | `bodies-select.png`, `match-cards.png` | the original cast with their cards |
| 1v1 lock-up | `move-lockup.png` | the collar-and-elbow tie-up both bodies play together |
| Impact | `feel-hit.png`, `move-suplex-impact.png`, `feel-finisher.png` | hitstop, slam, finisher cinematic |
| Near-fall | `feel-nearfall.png`, `fix-pin-three-after.png` | pin count with Lou on the mat |
| Booth | `booth-wide-desk.png`, `booth-lower-third.png`, `booth-announcer-intro.png` | announce desk, speaker lower-third, ring announcer |
| Over the Top | `royal-ring-1920.png` | five wrestlers in one ring |
| Alliance and betrayal | `royal-alliance-approve.png`, `royal-betrayal-approve.png` | decision log rail with the alliance and the turn |
| Commissioner card | `royal-card-approve-1.png`, `royal-card-block-1.png` | the approve/block verdict card |
| Outcome changes | `royal-end-approve.png` vs `royal-end-block.png` | same seed, different verdict, different ending |
| Odds | `royal-odds-1920.png` | fan-points odds panel priced from Bruin marts |
| Two humans | `royal-online-a.png` + `royal-online-b.png`, `u1-a.png` + `u1-b.png` | two browsers in one room |
| Ladder | `ladder-climb.png`, `ladder-betray.png` | ladder match prototype (menu mode) |
| Learning | `docs/learning/counter-rate.svg` | counter rate, memory on vs off |

## Run it

```bash
cd game && npm install && npm run dev
```

`npm run dev` starts five processes with `concurrently` (`game/package.json`): Vite web client, Colyseus arena server
(port 2567), agents server (`python -m agents.server` via `tools/agents_up.py`, port 8788), voice server
(`voice/server.js`, port 8787) and odds service (`python -m agents.odds`, port 8790). Open the Vite URL. For a second
human, open Online in the menu, copy the invite link (`?room=CODE`, plus `&royal=1` for Over the Top) and send it.

Needs Node, Python 3 with `band-sdk duckdb watchfiles` (`agents/pyproject.toml`), and the Bruin CLI
(`curl -LsSf https://getbruin.com/install/cli | sh`) for the memory pipeline.

Keys live in the repo-root `.env` (gitignored). Every key is optional: without it that part falls back and says so.

| Key | Used by | Without it |
|---|---|---|
| `OPENAI_API_KEY` | agents planner, promos, Bruin inference asset, booth color lines, TTS fallback | deterministic planner, template lines, inference skipped |
| `OPENAI_MODEL` | planner model (default `gpt-4o-mini`) | default |
| `RUNWARE_API_KEY` | voice server, Fish Audio S2.1 Pro voices | OpenAI TTS, then silent captions |
| `RUNWARE_TTS_MODEL` | voice model (default `fishaudio:s2.1@pro`) | default |
| `HEEL_BAND_MODE` | `live` or `mock` | `mock` (local rooms that enforce BAND delivery rules) |
| `HEEL_BAND_{VEX,KANE,SILAS,MAE,LOU}_ID`, `_KEY`, `_HANDLE` | each agent's own BAND identity | mock BAND |
| `HEEL_BAND_COMMISSIONER_ID`, `HEEL_BAND_COMMISSIONER_HANDLE` | the human commissioner in BAND | mock BAND |
| `HEEL_BAND_HUMAN_KEY` | room cleanup (`python -m agents.tools.band_rooms prune`) | read-only census |
| `HEEL_BRUIN_DUCKDB` | agents read the Bruin marts | stub marts in `agents/fixtures/marts.json` |

## Requirements map

Must-haves and boosters from the event site (`prep/event-site.md`), plus the Track 02 musts.

| Requirement | Where in the game | Evidence |
|---|---|---|
| Characters with a visual identity | Vex, Brutus Kane, Silas Crane, Old Iron Mae, Kid Riot, referee Lou Varga: Quaternius bodies with per-character gear, FLUX cards | `game/shared/characters.js`, `game/arena/bodies.js`, `docs/shots/bodies-select.png` |
| Visual output: a playable game | three.js ring, crowd, booth, entrances | `cd game && npm run dev`, `docs/shots/play-match.png` |
| Movement and action | strikes, lock-up, slams, Irish whip, pins, over-the-top tosses, ladder climbs | `game/moves/moves.js`, `node game/tools/feel-bench.mjs`, `docs/shots/move-*.png` |
| 3+ agents with own goals | 5 BAND agents (4 wrestlers + corruptible ref), each with its own key, traits and memory | `agents/personalities.json`, `python3 -m agents.demo` |
| Decision log | rail log in Over the Top and the results screen: every plan with intent, reason and the Bruin row it cites | `GET /log` on the agents server, `docs/shots/royal-alliance-approve.png`, `docs/shots/play-results.png` |
| T2: 2+ humans + 3+ agents in one world | Colyseus room `ring`/royal; empty slots are AI | `python game/ui/online_royal.py`, `docs/shots/royal-online-a.png`, `royal-online-b.png` |
| T2: agents ally, compete, betray | alliance on a human, schemer's betrayal, ref bribe | `node game/tools/royal_check.mjs` |
| T2: a major world event caused by agents alone | an approved betrayal ends in the partner tossed over the top rope | `node game/tools/royal_check.mjs`: `approve: the betrayer tosses his partner (an AI-caused elimination) in 4/5 runs`; `docs/shots/royal-end-approve.png` |
| Run it twice, outcome changes | same seed, commissioner approves vs blocks | `royal_check.mjs`: `approve and block change the outcome (order or winner) in most seeds`; `royal-end-approve.png` vs `royal-end-block.png` |
| Booster: 3D | three.js 0.170, skinned GLB bodies, contact IK on grapples | `game/arena/bodies.js`, `docs/shots/contact-suplex-apex.png` |
| Booster: memory that changes decisions | wrestlers query habits and grudges before each plan; a grudge row turns Mae against Silas | `docs/lanes/band-demo-output.txt` (Mae refuses Silas, `relationships.mae>silas`), `docs/lanes/learning.md` |
| Booster: voice | Rex and Dot in the booth, ring announcer, wrestler taunts, each its own voice | `voice/voices.js`, `docs/audio/fish-*.mp3`, `docs/audio/announcer-*.mp3` |

## Bruin Features Used

Every strike, alliance, betrayal and taunt is an event. Bruin turns events into checked DuckDB tables, and the
wrestlers query those tables before they plan. Full pipeline notes: `bruin/README.md`.

```
bruin/data/events.jsonl ──> raw.events (python) ──> staging.stg_events (sql + checks) ─┬─> marts.habits
seeds/wrestlers.csv ──────> seeds.wrestlers (seed) ─────────┘                          ├─> marts.relationships
                                                                                        ├─> marts.leaderboard
bruin/data/ref_ledger.jsonl ─> raw.ref_ledger ─> marts.ref_ledger ──┐                   ├─> marts.counter_rate
                                                                    ├─> marts.odds ─> marts.props
                                                  (habits, relationships, leaderboard) ┘
bruin/data/bets.jsonl ─> raw.bets ─> marts.fan_ledger (with stg_events)
                                                                    marts.taunt_tone  (OpenAI inference asset)
```

| Feature | Where | What it does |
|---|---|---|
| Python assets | `bruin/assets/raw/events.py`, `assets/marts/raw_ref_ledger.py`, `raw_bets.py` | JSONL logs into `raw.*` |
| Seed asset | `assets/seeds/wrestlers.asset.yml` | roster CSV that the checks reference |
| SQL assets on DuckDB | `assets/staging`, `assets/marts` | staging plus habits, relationships, leaderboard, counter_rate, ref_ledger, odds, props, fan_ledger |
| Built-in column checks | every asset | `not_null`, `unique`, `accepted_values` on `kind` and `situation`, `min`/`max`, `positive` |
| Custom checks | stg_events, habits, relationships, leaderboard, odds, fan_ledger | actor on the roster; habit share in (0, 1] and sums to 1; no unknown wrestler; one winner per match; win probabilities sum to 1; winner results agree with match events |
| Blocking checks, planted bad row | `bash bruin/prove_bad_row.sh` | a corrupt event (`kind: suplex`, `target: ghost`, `situation: on_fire`) fails 4 staging checks, every mart is `UPSTREAM FAILED`, exit 1. The wrestlers keep the last good memory. Output: `docs/lanes/bruin-checks.txt` |
| Inference asset | `assets/marts/taunt_tone.asset.yml` (`type: inference`, `provider: openai`, `choices`) | labels each taunt heel/face/neutral, cached, with its own `accepted_values` check. "Trust is for people who lose." -> heel |
| Tags and `--exclude-tag` | `bruin/run.sh` | runs inference only when `OPENAI_API_KEY` is set |
| Lineage and column lineage | `python3 bruin/lineage.py` | e.g. `habits.move <- stg_events.kind <- raw.events.kind`. Output: `docs/lanes/bruin-lineage.txt` |
| `bruin query` with `--var`, JSON out | `bruin/queries/*.sql` via `bruin/memory.mjs` and `agents/memory.py` | the pre-plan lookups: `counter_pick`, `habits_for`, `feelings_of`, `leaderboard`. Each row carries a `cite` the decision log prints. Output: `docs/lanes/bruin-queries.txt` |
| Odds marts | `marts.odds`, `marts.props`, `marts.fan_ledger`, `marts.ref_ledger` | fan-points odds and prop polls priced from memory; a rewritten winner fails the payout check (`python3 -m agents.odds.demo`, `docs/lanes/odds-demo-output.txt`) |
| `bruin run --only checks`, `bruin validate` | `prove_bad_row.sh`, `run.sh` | re-check tampered marts without a rebuild; config errors caught before a run |

Measured: `bash bruin/run.sh` went green with 13 assets and 80 checks after the odds merge (`docs/decisions.tsv`,
2026-11-23T13:33). That run also caught a real bug: unfinished live matches broke the one-winner check, and
`leaderboard.sql` was fixed to skip them. Caveat: the 4 fixture matches are scripted, so the fixture `counter_rate`
proves the SQL, not learning (`docs/lanes/bruin.md`).

## BAND: delete-test signals

Five BAND agents: Vex, Brutus Kane, Silas Crane, Old Iron Mae and referee Lou Varga. The human commissioner is a BAND
human participant. Remove BAND and none of these four things can happen. Code: `agents/brain.py`,
`agents/transport.py`.

| Signal | What happens | Evidence |
|---|---|---|
| Private locker rooms | heel room `[silas, vex]` and face room `[kane]`; Kane receives 0 heel messages; a ring message that mentions `[mae, commissioner]` does not reach Vex | `docs/lanes/band-demo-output.txt`, PASS 1 |
| Runtime entrant | Mae enters at t=8000: `band_lookup_peers` by Lou, then `band_add_participant` into the ring, the face room and a new `silas x mae` room | PASS 2 |
| Alliance offer -> reply handoff | each offer lands in the target's inbox; the target answers from its own memory row. Mae accepts Kane (`relationships.mae>kane` trust 0.75), refuses Silas ("remembers m9") | PASS 3 |
| Commissioner verdict | Silas's betrayal of Vex waits as `betray-1` in the commissioner desk room (Vex is not a member); approve -> next tick Silas plays `betray vex approved_by=commissioner`. Lou's bribe `bribe-2` is blocked -> Lou calls `count_fair` | PASS 4; `POST /verdict` -> `GET /log` shows `vetoed_by: commissioner` |

Run: `python3 -m agents.demo` (exits 1 if any signal is missing) and
`python3 -m unittest discover -s agents/tests -t .`. Live mode: `HEEL_BAND_MODE=live python3 -m agents.server`; the
commissioner types `@<silas handle> approve betray-1` in the Band app, or presses the in-game card, which posts the
same message.

**Room pool.** Live play hit BAND's account cap (`403 max_chat_rooms 250/250`). `transport.RoomPool` now keeps one
room per purpose (ring, heel room, face room, commissioner desk, back room, `silas x <id>`), saved in
`agents/.band_rooms.json`, and tags each message with `[match]`. The runtime entrant is still a real
`band_add_participant` every match. `TestRoomPool` plays 20 matches with zero room creations after warm-up; `/health`
reports `band_rooms n/250`.

Planner model picked by measured latency (`python3 -m agents.latency`, n=3 each): `gpt-4o-mini` p50 1017 ms, against
1192 ms for `gpt-4.1-mini` and about 1.5 s for the gpt-5 minis at minimal reasoning.

## Runware

Every voice in the arena runs on **Fish Audio S2.1 Pro through Runware** (`fishaudio:s2.1@pro`, `voice/server.js`):
Rex Ramsey (play-by-play), Dot Calloway (color), the ring announcer, and the wrestlers' taunts, each with its own Fish
voice id in `voice/voices.js`. Fish was picked after a same-line A/B on Runware against HeyGen Voice 1.0 and Inworld
(`docs/audio/compare-*.mp3`). Samples: `docs/audio/fish-rex.mp3`, `fish-dot.mp3`, `fish-ring.mp3`.

The voice server caches every clip on disk by sha256, pre-renders the template lines and announcer calls at start,
and falls back to OpenAI `gpt-4o-mini-tts` without a Runware key. Measured (`node voice/test/latency-neural.mjs`,
n=12, earlier OpenAI path): cached first byte p50 3.6 ms, uncached p50 1463 ms. `cd voice && npm test` covers the
Runware request shape, auth, six distinct voices and the cache. Music and crowd are synthesized in WebAudio
(`voice/music.js`, `voice/crowd.js`), not Runware.

## Learning, honestly

Declared metric (`docs/PLAN.md`, before the run): counter rate, the share of the human's moves the AI met with the
move that beats it. Memory ON carries the habit counts into the next match, as the Bruin `habits` mart does; memory OFF
starts blank. Same seeds. `node learning/batch.mjs --reps 200 --series 20 && node learning/chart.mjs`: 32,000 headless
matches, 200 series of 20 per persona per condition, bot humans with fixed habits. 95% CIs over per-series means.

| Bot persona | OFF | ON | ON minus OFF | shuffle chance |
|---|---|---|---|---|
| striker | 46.7% | 49.2% | +2.5 pp ± 0.4 | 31.1% |
| turtle | 38.6% | 39.9% | +1.3 pp ± 0.5 | 26.5% |
| grappler | 48.5% | 49.4% | +0.9 pp ± 0.4 | 35.7% |
| switcher | 47.8% | 49.5% | +1.7 pp ± 0.5 | 33.6% |

What this does and does not show (`docs/lanes/learning.md`, `docs/learning/summary.json`):
- Memory helps a little, for every persona: 1 to 2.5 points, every CI above zero.
- Most of the countering is not memory. With memory OFF the AI already sits 12 to 16 points above chance, from the
  reactive layer in `game/shared/ai.js` that reads wind-ups.
- Adaptation is weak. After the switcher changes style, memory's edge drops to zero within the CI, because habit counts
  never decay. The switcher's +1.7 pp also disappears on engaged moves only (+0.2 ± 0.6).
- Bot humans, not people. Real players may be more or less predictable.
- LLM planner spot check, small N: on the same 10 seeds the OpenAI planner countered 10.3 pp ± 6.6 more than the
  counting model (n = 9 pairs, 154 of 154 plans from OpenAI, plan p50 1188 ms). It is confounded (the LLM also saw a
  real player's marts) and loose (another run gave +9.0 ± 5.3). `node learning/llm_check.mjs --matches 10`,
  `docs/learning/llm-spot-check.json`.

Where memory visibly changes a decision: Mae refuses Silas's alliance because her `relationships.mae>silas` row holds a
grudge, and promos quote the human's habit rows ("You threw the same strike 14 times in the opening"),
`docs/lanes/promo.md`.

## Architecture

```
 Browser A ─┐                                   ┌──────────────────────────────────────────┐
 Browser B ─┼─ three.js client (Vite) ── ws ──> │ Colyseus arena server  game/server :2567 │
            │   game/main.js, royal-client.js   │ runs shared/sim.js + shared/royal.js 30 Hz│
            │                                   └──────────────────────────────────────────┘
            ├─ /agents ──> agents server  python -m agents.server :8788
            │               Director: plans every ~4 s (OpenAI gpt-4o-mini), proposals, verdicts, /log
            │                  │                         │
            │                  ├── BAND (band-sdk REST) ─┘  rooms, add_participant, offers, commissioner desk
            │                  └── agents/memory.py ──> Bruin marts in DuckDB
            │
            ├─ /mem ─────> bruin/memory.mjs ──> bruin query ──> DuckDB
            │               events.jsonl ──> bruin run (checks, marts, inference) between matches
            ├─ /voice/api > voice server  voice/server.js :8787 ──> Runware Fish Audio S2.1 Pro (OpenAI TTS fallback)
            ├─ promo  ───> python -m agents.promo :8789 (OpenAI, cites mart rows)
            └─ odds  ────> python -m agents.odds :8790 (prices from marts.odds / props)
```

The simulation is pure data shared by client and server, so exhibition and online play run the same rules. The LLM
decides each AI wrestler's intent and target; the scripted fighter executes moves at frame rate.

## Credits and licenses

- Wrestler bodies and base animations: Quaternius Universal Base Characters and Universal Animation Library, CC0 1.0
  (`game/public/models/wrestlers/CREDITS.md`).
- Card, portrait, entrance and arena art: Black Forest Labs FLUX.2 and FLUX Kontext, prompts and seeds in
  `game/public/art/CREDITS.md`.
- Voices: Fish Audio S2.1 Pro on Runware; OpenAI `gpt-4o-mini-tts` as fallback.
- Language models: OpenAI (planner, promos, booth lines, Bruin inference asset).
- Libraries: three.js, Colyseus, Vite, Bruin CLI, DuckDB, band-sdk.

All characters, names, hometowns and the "Over the Top" battle royal are original. No WWE marks, no real wrestlers, no
real names.
