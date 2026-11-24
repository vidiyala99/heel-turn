# Lane: booth agents (Rex and Dot as LLM agents)

Goal (Aakash 15:53): the booth felt scripted. Rex and Dot should be agents that see the match, the wrestler agents'
plans and reasons, Bruin memory and each other, and decide what to say. They should not be template players.

## What changed
- `voice/booth-agent.js` (new): `createBoothAgents({ generate, say, prefetch, onLine, onDrop })`.
  - Each commentator has a persona, goals and memory. Rex calls it honestly, hypes the face and worries about schemes.
    Dot roots for heels, defends cheaters and needles Rex. Memory holds the scheme lines each one said (`your_notes`).
  - Shared board: the last 6 events, the last 5 wrestler plans with reasons, Bruin memory (grudge, player habit,
    Lou's bribe ledger built from `count_fast` plans) and the last 6 booth lines.
  - Cadence: every 2.5 s one mind writes the next line. Whoever did not speak last answers, which produces the
    banter. The model replies `[ref] line` or `[pass]`. `ref` records what the line reacted to (`rex`, `dot`,
    `plan:silas`, `event:betray`, `memory`).
  - Big moments (bribe, finisher, elimination, betrayal) kick both minds immediately with `react_now`. A line
    written for that moment is `big`. It jumps idle thoughts, and only another big line can replace it.
  - Staleness: one ready line per speaker, so a fresher thought replaces an older one. A line older than 6 s is
    dropped. So is a non-event line written before the latest big moment.
  - The bank (`lines.js HITS`) holds one- and two-word hit reactions only ("OH!", "BODY SLAM!", "BETRAYAL!").
    `warmLines` pre-renders them.
  - Transport: the existing `POST /voice/api/line` in `voice/server.js`. The whole briefing rides in `event`, which
    the server passes to the model unclipped, so server.js was not touched (another lane owns it).
- `game/agent-layer.js` (hook): when the voice server has an LLM, the booth is `createBoothAgents` instead of
  `createCommentary`. It gets every BAND plan (`onPlan`) and the Bruin grudge and habit (`setMemory`), starts at
  matchStart and stops at matchEnd. Every spoken line becomes a decision-log row. Generated lines show
  `LLM` / `Rex (LLM, 0.7 s) says ...` / `reacted to plan:silas`. Bank lines show `BANK` / `Rex (bank)`.
  Without an LLM the old template `commentary.js` still runs.

## Verification
- `node --test voice/test/*.test.js`: 13 tests, 12 pass, 1 fail. The failure is `server.test.js` "tts proxies
  Runware". It expects voice `Hades` but `voices.js` (d36881e, voice lane) now has a Fish voice id. It fails on base
  too and is not in this lane's files. The 4 new tests in `voice/test/booth-agent.test.js` and the existing
  commentary tests all pass.
- `vite build` in `game/` is clean.
- Real LLM run: `node voice/test/booth-run.mjs 60` serves the real `voice/server.js` on a local port and feeds a
  60 s fixture of events and agent plans. gpt-4.1-mini, speech timed by reading-speed estimate. Full transcript:
  [booth-agents-run.txt](booth-agents-run.txt). Measured (one run):
  - Spoken 18: generated 13 (72%), bank 5 (28%). All 5 bank lines are one- or two-word hits.
  - 34 generations: 33 lines, 1 pass, 0 failed, 20 dropped (replaced, outranked or stale). p50 latency 747 ms,
    min 570, max 3611.
  - The previous run, before big-moment hits could queue while the booth was talking: 94% generated, p50 768 ms.

### 10 exchanges from the run
1. 8.0 s Rex (re plan:silas): "Silas plots to use Brutus's size to end Mae early!" (from Silas's ally plan, before the alliance paid off)
2. 12.1 s Rex (re plan:silas): "Crane's alliance with Kane smells like a setup against Mae, watch out!"
3. 16.9 s Dot (re plan:silas): "Crane's bribing Lou again, fast count to crush Mae's hopes!" (4 s before the bribe event, from the plan and Lou's ledger)
4. 21.1 s Rex (bank): "Hey!" → 22.3 s Rex (re event:bribe): "Silas bribes Lou again; the ledger proves this fast count's dirty!"
5. 26.8 s Dot (re event:bribe): "Silas cracks the ledger with Lou; Lou's wallet's got a hole!"
6. 35.7 s Rex (bank): "BETRAYAL!" → 38.1 s Rex (re event:elimination): "Silas stabbed Kane in the back, elimination for cold cash again!"
7. 42.6 s Dot (re event:elimination): "Crane backstabs Kane, smart, ruthless, and straight to the prize!"
8. 46.7 s Dot (re rex): "Cry me a river, Rex, betrayal pays and Silas knows it!"
9. 53.0 s Rex (re event:finisher): "Old Iron Mae's grudge fuels her unstoppable finishing move on Crane!" (Bruin grudge 4)
10. Earlier run: Rex "Karma's sweet, but Crane's plotting a fast count with Lou." answering Dot's "that was just Old Iron Mae's karma bite."

## Known gaps
- Wrestler taunts in their own voices only run on the template path. In LLM mode the booth does not voice them.
- Dot's lines are dropped more often than Rex's: 20 dropped lines in 34 generations is wasted spend. A next step
  would skip a tick when that speaker already has a fresh ready line.
- The live game booth has not been heard end to end with TTS. Generated lines are TTS-uncached, so expect about
  1.5 s of TTS on top (prefetch starts when a line becomes ready, usually seconds before it plays).
- The model sometimes invents detail ("eyeing Mae's corner"). The brief says to state only facts on the board.
