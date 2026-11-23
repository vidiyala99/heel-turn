# Lane: BAND (AI wrestler brains) — agents/

Branch `lane/band`. Five BAND agents: Vex (showboat), Brutus Kane (brute), Silas Crane (schemer), Old Iron Mae
(veteran), referee Lou Varga (corruptible). The human commissioner is a BAND human participant.

## Files
| File | What |
|---|---|
| `agents/personalities.json` | cast as data (traits, thresholds, lines, fight triangle) |
| `agents/memory.py` | Bruin mart reader: duckdb at `HEEL_BRUIN_DUCKDB`, else stub rows `agents/fixtures/marts.json` |
| `agents/planner.py` | OpenAI planner (validated JSON) + deterministic fallback; plan rows have exactly the PLAN keys |
| `agents/transport.py` | `MockBand` (enforces BAND delivery rules) / `LiveBand` (band-sdk `band_rest` REST client) |
| `agents/brain.py` | `Director`: rooms, runtime entrant, alliances, proposals, per-tick plans |
| `agents/server/__main__.py` | HTTP service for the game |
| `agents/demo.py` | mock end-to-end match; exits 1 if any of the 4 BAND signals is missing |
| `agents/latency.py` | measures planner latency per model |
| `agents/tests/test_agents.py` | 9 offline tests |

## VERIFIED (2026-11-23, this VM, OPENAI_API_KEY present in env, BAND keys absent)
1. **Demo, all four signals, live OpenAI planner + mock BAND.** `python3 -m agents.demo` (full output:
   [band-demo-output.txt](band-demo-output.txt)):
   ```
   == HEEL TURN agents demo  band=mock planner=openai memory=stub
   ...
     per-agent decide: n=24 p50=980.6ms max=1481.2ms
   == SIGNALS
     PASS  1 private rooms
     PASS  2 runtime entrant
     PASS  3 alliance answered
     PASS  4 commissioner verdict
   ```
   What each signal shows (in the output):
   - **1 private rooms / mention boundary:** heel room `[silas, vex]`, face room `[kane]`; kane received 0 heel msgs;
     `NEW ENTRANT` ring message mentions `[mae, commissioner]`, so vex (in the ring, not mentioned) does not receive it.
   - **2 runtime entrant:** Mae appears in the state at t=8000 -> `band_lookup_peers by=lou` -> `band_add_participant`
     into the ring, the face locker room and a new `silas x mae` room.
   - **3 dependent handoff:** each offer goes to the target's inbox; the target replies from its own memory row:
     Mae ACCEPTS Kane (`relationships.mae>kane` trust 0.75), REFUSES Silas (`relationships.mae>silas`, "remembers m9").
   - **4 blockable verdict:** Silas's betrayal of Vex (`relationships.silas>vex` trust 0.30, grudge 0.70) waits as
     `betray-1` in the commissioner desk room (Vex not a member, saw 0 desk msgs); the commissioner approves, and the
     next tick Silas plays `betray vex approved_by=commissioner`. Lou takes Silas's bribe (`ref_ledger` rows: greed 0.60 -
     0.70 x caught 0.33 = +0.37) -> `bribe-2` -> the commissioner blocks it -> Silas pins Kane and Lou calls `count_fair`.
2. **Tests.** `python3 -m unittest discover -s agents/tests -t .` -> `Ran 9 tests ... OK (skipped=1)`; the skipped
   duckdb test passes with duckdb installed: `uv run --no-project --with duckdb python -m unittest
   agents.tests.test_agents.TestMemory -v` -> `test_duckdb_reader ... ok`.
   Includes a regression test: an LLM referee that wants `count_slow` is held to `count_fair` once the bribe is blocked
   (the first live run hit exactly this bug; fixed in brain.py `_ref_job`).
3. **Server over real HTTP.** `python3 -m agents.server`, then urllib calls:
   `GET /health -> {"ok": true, "band": "mock", "planner": "openai", "memory": "stub"}`; `POST /plan` -> 4 plan rows,
   `latency_ms 2395.7`, pending `['betray-1']`; `POST /verdict {"id":"betray-1","decision":"block"} -> blocked`;
   `GET /log` last row has `"vetoed_by": "commissioner"`.
4. **Model choice by measured latency.** `python3 -m agents.latency gpt-5-mini gpt-4.1-mini gpt-4o-mini gpt-5-nano`
   (n=3 each, all 0 fallbacks): gpt-5-mini(minimal) p50 1461ms; gpt-4.1-mini p50 1192ms; **gpt-4o-mini p50 1017ms**
   (default); gpt-5-nano(minimal) p50 1499ms. gpt-5-mini at default reasoning took 8.7-12.7 s per call.
5. **Live-mode env check.** With band-sdk installed and no BAND env:
   `RuntimeError live BAND needs env: HEEL_BAND_VEX_ID, HEEL_BAND_VEX_KEY, ... HEEL_BAND_COMMISSIONER_ID`.

## NOT verified
- **Live BAND calls.** No BAND agent ids/keys on this VM. `LiveBand` uses band-sdk's own `band_rest.RestClient`
  methods (`create_agent_chat`, `add_agent_chat_participant`, `list_agent_peers`, `create_agent_chat_message`,
  `list_agent_messages`); the method names and request types were read from the installed SDK, but no call has hit
  app.band.ai yet. Most likely to need a fix: response field names in `_dig_id` and in `verdicts()`
  (`sender_id` / `sender.id`), and the `handle` used in mentions.
- Agent-to-agent `band_add_participant` permission: the SDK doc says agents can add **sibling agents (same owner)**,
  so all 5 agents must be registered under the same Band account.
- Real Bruin marts: the duckdb reader is tested against a temp duckdb with `marts.relationships`; table and column
  names must match `docs/PLAN.md` (`habits, relationships, leaderboard, ref_ledger, partner_trust`).
- The 5 agents are not running `agent.run()` WebSocket loops: the Director acts for each agent with that agent's
  own key over REST. Each message in the Band console is still sent by the agent named in it.

## Env vars
| Var | Default | Purpose |
|---|---|---|
| `HEEL_BAND_MODE` | `mock` | `live` -> real band.ai via band-sdk |
| `HEEL_BAND_{VEX,KANE,SILAS,MAE,LOU}_ID` / `_KEY` | - | each agent's Band id + API key (live) |
| `HEEL_BAND_{X}_HANDLE` | looked up via /peers | @handle used in mentions |
| `HEEL_BAND_COMMISSIONER_ID` / `_HANDLE` | - | the human commissioner's Band user id/handle (live) |
| `OPENAI_API_KEY` | - | unset -> deterministic fallback planner |
| `OPENAI_MODEL` | `gpt-4o-mini` | planner model |
| `HEEL_LLM_TIMEOUT_S` | `2.5` | per-call timeout, then fallback |
| `HEEL_LLM_REASONING` | `minimal` for gpt-5*, else none | `reasoning_effort` |
| `HEEL_BRUIN_DUCKDB` | - | Bruin duckdb file; unset -> stub marts |
| `HEEL_BRUIN_SCHEMA` | `marts` | schema tried before unqualified names |
| `HEEL_BRIBE_AT_MS` | `15000` | match time when Silas offers Lou the envelope |
| `HEEL_AGENTS_PORT` | `8787` | server port |

Going live: `uv pip install band-sdk duckdb` (deps listed in agents/pyproject.toml), export the vars above,
`HEEL_BAND_MODE=live python3 -m agents.server`. The commissioner approves/blocks by typing `@<silas handle> approve betray-1`
(or `block ...`) in the "commissioner desk" room in the Band app. The game's button (`POST /verdict`) sends the same
message.

## How main.js should call it
Run `python3 -m agents.server` (repo root). CORS is open.
```js
// every ~4 s and on entry / knockdown / pin; never block the frame loop on it (p50 ~1 s per agent, ticks run in parallel,
// ticks with alliance offers take 2-4 s because each reply waits on its offer)
const res = await fetch(`${AGENTS}/plan`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
  match: 'm13', t_ms,                                         // a new match id resets rooms
  wrestlers: [{id: 'vex', stamina: 0.8, down: false, eliminated: false}, ...], // ids: vex kane silas mae; add one to enter it
  humans: [{id: 'p1', situation: 'opening', stamina: 0.7}],   // situation: opening|after_block|low_stamina|cornered
  crowd: {vex: 0.3}, pin: {by: 'silas', on: 'kane'} | null,
})}).then(r => r.json());
// res.plans: [{t_ms, wrestler, intent, target, reason, cites, room, approved_by?, vetoed_by?}] one per AI agent + 'lou'
// res.pending: proposals waiting for the commissioner -> show approve/block buttons:
await fetch(`${AGENTS}/verdict`, {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({id: 'betray-1', decision: 'approve' /* or 'block' */})});
// decision log panel: GET /log?since=N -> {rows, next}
```
Mapping intents to the fighter: `counter` -> play the move that beats the habit in `cites[0]` (`habits.p1/opening/strike` ->
strike is beaten by **block**; triangle in personalities.json); `target` -> attack `target`; `pin`/`toss` -> finish
`target`; `taunt`; `ally` -> stop attacking `target`; `betray` (only ever arrives with `approved_by`) -> cheap-shot `target`.
Lou's intents (an extension, same row keys): `count_fair|count_fast|count_slow` for the current `pin`, and
`bribe_accept|bribe_decline` in the log.
