# Lane: ringside (pin bug, referee pose, ring announcer, entrances), 2026-11-23

Branch `lane/ringside`. Brief: docs/briefs/ringside.md. Commands run from `game/` unless noted.

## 1. Early pin: VERIFIED
Cause: the AI slams an idle human at the bell and covers inside 2-6 s. Every pin it made was after a real
knockdown, so the 'down' rule already held; nothing gated the time. Fix: `tryPin` in shared/sim.js refuses a
cover before `PIN_GRACE` = 8 s of match clock (one guard, the single place every pin starts). An LLM plan with
intent `pin` already maps to the high-aggression attitude in ai.js and only covers a downed foe, so it keeps
pressing until a knockdown, and the test covers that too.
```
$ node tools/pin-guard-check.mjs        # 200 seeded matches, human idle 10 s, odd seeds carry an LLM "pin" plan
before: 200 matches ... 186 pins, 179 pins before 8 s, 0 pins before a knockdown  FAIL
after:  200 matches ... 112 pins, 0 pins before 8 s, 0 pins before a knockdown     PASS
```

## 2. Referee pose: VERIFIED numerically (no browser here)
Root cause: three's PropertyMixer skips `setValue` on a bone whose clip value did not change since the last
frame, so feel/life.js nudges (and the ref's deliberate +10 deg "hands on knees" lean) stacked frame after
frame and folded Lou into a crouch. Measured 157 deg torso lean within seconds. Fixes:
- life.js undoes its own nudge on any bone nothing rewrote since (this also applies to the wrestlers' stance nudges).
- the ref gets a world-space upright clamp (torso at most 4 deg off vertical before breathing).
- arena/referee.js (new) owns Lou: roam side-on to the wrestlers' line so both stay in view, `refcount` to the
  mat on a pin, then `refrise` (new 0.6 s move in moves/moves.js) back to standing.
- main.js runs the ref's mixer before updateMoves, so the count pose blends over his clip, not under it.
```
$ node tools/ref-check.mjs
roam max lean 6.3 deg; max wrestler off-axis 37.8 deg; pelvis standing 1.94 m, counting 1.46 m (drop 0.48 m); final phase roam
PASS
```
(before the life.js fix the same check printed `roam max lean 156.9 deg`.) NOT verified: how it looks in WebGL.

## 3. Ring announcer: VERIFIED (mp3s rendered through the server's own tts())
New `ring` voice in voice/voices.js (OpenAI `onyx`, deep PA baritone, long vowels, original wording).
voice/announcer.js builds the opener, intros (hometown + weight now in shared/characters.js), the winner call
and the Over the Top entrant call. server.js warmCache pre-renders all 20 announcer lines first, then the booth.
```
$ node voice/render-announcer.mjs     # from repo root, OPENAI_API_KEY in env
announcer-open.mp3 82560 bytes rendered 1937 ms | Ladies and gentlemen... this contest is scheduled for ONE FALL!
announcer-intro-vex.mp3 131328 bytes rendered 2003 ms | Introducing first... from Neon Flats, Nevada... weighing in at 212 pounds... VEX!
announcer-intro-kane.mp3 136320 bytes rendered 1853 ms | And his opponent... from the Iron Range of Minnesota... weighing in at 318 pounds... BRUTUS KANE!
announcer-winner-mae.mp3 80256 bytes rendered 1918 ms | Here is your winner... OLD IRON MAE!
announcer-entrant-silas.mp3 108288 bytes rendered 1966 ms | Next entrant... from Blackwater Parish, Louisiana... SILAS CRANE!
$ cd voice && node --test test/server.test.js test/commentary.test.js   -> tests 9, pass 9, fail 0
```
Files: docs/audio/announcer-{open,intro-vex,intro-kane,winner-mae,entrant-silas}.mp3. Hooks: the intros play
in the entrance (below), the winner call 1.4 s after the end of any match (main.js matchEnded).
NOT done: the Over the Top entrant call is built and warmed (`entrantLine`) but not called, because the battle
royal lives on another branch. It needs one call `layer.announce(entrantLine(id))` where an entrant joins.
Not listened to by a person yet.

## 4. Entrances: VERIFIED by a node check, NOT rendered
game/feel/entrance.js (new) runs before the bell in exhibition matches: the opponent first, then the player,
each ~6 s: entrance card on the big screen, a white key spot with a visible additive cone plus two wash lights in
the wrestler's palette, a walk from their corner to their start mark, a taunt (tauntArms / chestPound), crowd
swell, music sting, and the announcer intros queued in walk-out order. The camera is a low tracking shot ahead of
the walker. Enter skips to the bell. The sim does not step while it runs; at the end `introT` drops to 0.01, so
the bell rings and the normal match camera takes over. main.js hooks: create, start when both bodies exist,
skip `step` while active, hand it the camera, `finish()` on toMenu. agent-layer.js exposes announce/swell/sting.
```
$ node tools/entrance-check.mjs
entrance times per wrestler (kane, vex): 6.03 s, 6.03 s; total 12.07 s; max camera y during walk 1.45 m (mat 1.1); stings kane,vex
announcer: 3 lines | Ladies and gentlemen... ONE FALL! | Introducing first... BRUTUS KANE! | And his opponent... VEX!
skip at 2 s: active after finish = false, introT 0.01
PASS
$ npx vite build   -> built in 1.83s
```
NOT done: CPU-rendered frames (docs/shots/entrance-*.png). The node check covers timing, path, camera height,
lines and skip, not the look. Known risk: the opener + first intro run about 8 s of audio against a 6 s entrance,
so the second intro starts late into the second walk. Online matches have no entrance (the server owns the sim).

## Other
- Regression checks still pass: `node tools/alive-check.mjs` PASS, `node tools/habit-check.mjs` PASS.
  `tools/contact-check.mjs` fails to start here because playwright is not installed (environment, unrelated).
- Design stack: read impeccable and emil-design-eng (head) and frontend-design. design-taste-frontend and
  redesign-existing-projects do not exist under ~/design/skills on this VM. Decisions: impeccable (Experience
  mode: the entrance is the artifact, so no HUD/overlay during it, only light, card and voice); emil-design-eng
  (lights fade in over 0.4 s and Enter skips instantly: a skip never waits on an animation); frontend-design
  (one orchestrated moment per wrestler instead of scattered effects).
- Pushed to origin lane/ringside.
- sim.js touched in one place (tryPin guard + PIN_GRACE export); ai.js untouched.
