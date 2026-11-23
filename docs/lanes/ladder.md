# Lane: ladder (ladder match prototype)

Goal: a ladder match. A briefcase hangs over the ring centre, and the first wrestler to climb a ladder and grab
it wins. AI agents can coordinate: one holds the ladder for a partner and can betray by shoving it over.
Everything lives in `game/ladder/` and `game/ladder.html`. No file outside those was edited.

The brief said to finish with `docs/lanes/bruin.md`. That file is the Bruin lane's finished report, so
overwriting it would destroy that lane's record. This report is in `docs/lanes/ladder.md` instead.

## Files

| File | What it is |
| --- | --- |
| `ladder/state.js` | Pure model, no three.js. The ladder state machine, `act()`, `move()`, the scripted AI `aiDecide()` and the PLAN-schema events |
| `ladder/moves-ladder.js` | Ladder poses and moves in the game/moves format: climb L/R, `ladderFall0..8` (scripted fall from each rung), grab, setup, shove, carry/hold overlays. Registered into `MOVES`/`POSES` at runtime |
| `ladder/mount.js` | `mountLadder(scene, opts)` draws the model in a three.js scene: ladder mesh, tip animation, briefcase on a cable, wrestler moves |
| `ladder/arena.js` | Ring, lights, crowd and screen, copied from main.js |
| `ladder/main.js`, `ladder.html` | Standalone page: Xbot (you, red) vs scripted AI (Silas Crane, blue), keyboard, HUD, event log, win banner |
| `ladder/scenes.js` | Fixed moments (climb, betray, grab), used by `ladder.html?scene=` and both Node checks |
| `ladder/verify.mjs`, `ladder/verify-node.mjs`, `ladder/render-cpu.mjs` | Checks and the shot renderer |

Ladder states are `on_mat`, `carried(by)`, `standing` (holder optional), `climbed(by, rung, side)` (holder
optional) and `tipped`. Actions are `pickup drop setup climb descend hold release shove betray_shove grab`.
Event kinds are `ladder_set ladder_climb ladder_hold ladder_betray ladder_grab`, plus `ladder_tip` for a
shove by someone who was not holding. A shove against a held ladder is blocked, and the shover's next
situation is `after_block`. Events are `{match, t_ms, actor, kind, target?, situation, success?, text?}`.

## Verified (2026-11-23, from `game/`)

| Claim | Command | Output |
| --- | --- | --- |
| State machine and event schema | `node ladder/verify.mjs --model-only` | 24 PASS lines, ending `PASS all 16 model events match the PLAN schema` / `model kinds: ladder_set, ladder_climb, ladder_hold, ladder_betray, ladder_grab` |
| Real Xbot rig poses on the ladder, mount driven headless | `node ladder/verify-node.mjs` | `ALL PASS`. e.g. `climb: feet are up on the ladder mid-step (feet above mat 1.57,1.75)`, `betray: actor ai, target p1, success`, `betray: climber is mid-air (hips 2.35 m above mat)`, `betray: body ends where the model says (body 0.00,1.26 model 0.00,1.26)`, `grab: briefcase is in the right hand (dist 0.12)` |
| Scripted AI wins a match unaided | same command | `live after 20 s: {"ladder":"climbed","rung":8,"winner":"ai"} ladder_set,ladder_climb x8,ladder_grab` |
| Vite serves every ladder module | `node ladder/verify-node.mjs http://127.0.0.1:5198/` with vite on 5198 | `PASS vite serves ladder.html (HTTP 200)` and the same for the 6 modules, `ALL PASS` |
| Shots | `node ladder/render-cpu.mjs` | `docs/shots/ladder-climb.png` (mid-step to rung 5), `ladder-betray.png` (holder shoved, ladder mid-tip, climber falling), `ladder-grab.png` (case raised over the top rung). I opened all three and each shows the intended moment |

## Not verified

- **No headless Chromium run.** Chromium 131 downloads, but it cannot start on this VM. System libraries
  (libnss3, libgbm and others) are missing and installing them needs sudo, which this run does not have.
  The shots come from `render-cpu.mjs`, which uses the real scene graph (Xbot rig, `mountLadder`, the same
  scenes) and draws flat-shaded triangles on the CPU. They show the poses and geometry, not the WebGL
  look: no lights, shadows, textures, crowd or HUD. `node ladder/verify.mjs http://localhost:5199/`
  is the browser check. It writes the real screenshots and asserts the in-page state, and it has never run.
- Keyboard play, the HUD and the win banner have never been seen in a browser.
- A stray `vite --port 5199` (pid 1627) from my first browser attempt is still running. Killing it needs
  approval this run did not have. It only holds that port.

## Mounting it as a mode in main.js

```js
import { mountLadder } from './ladder/mount.js';
const mode = mountLadder(scene, {
  players: [ // obj = Xbot clone, feet at origin
    { id: 'p1', name: 'You', human: true, x: -1.8, z: 0.6, yaw: Math.PI / 2, obj, mixer, clips: { idle, walk } },
    { id: 'vex', name: 'Vex', x: 1.8, z: -0.9, yaw: -Math.PI / 2, obj, mixer, clips, ai: { ally: 'p1', betrayAtRung: 5 } },
  ],
  matY: MAT_Y, matchId, ladderStart: { x: 0, z: 2.2, yaw: Math.PI / 2 },
  driveMoves: false,              // main.js already calls updateMoves(dt) once per frame
  onEvent: (e) => logEvent(e),    // PLAN schema, same pipe as strike/grapple events -> events.jsonl -> Bruin
  onCamera: (cue) => shake(cue),  // 'thump' | 'shake' | 'close'
});
// per frame: mode.input('p1', mx, mz); mode.update(dt);
// keys:      mode.act('p1', 'climb' | 'hold' | 'betray_shove' | ...)
// on exit:   mode.dispose()
```

- While the mode runs, main.js should skip its own sim step for the wrestlers that the mode owns. The mode
  sets their position and rotation every frame.
- For LLM or BAND agents, call `mode.setPolicy(id, null)` to stop the scripted AI, then drive the agent with
  `mode.act(id, 'hold')` and `mode.act(id, 'betray_shove')`. A betrayal emits `ladder_betray` with
  `target` = the climber. The agent's `plan` row can cite that event.
- `mode.focus()` returns `{ ladder, climbHeight, case }` so the camera can follow the climb.
- `mode.state.winner` is set on a successful `ladder_grab`.
