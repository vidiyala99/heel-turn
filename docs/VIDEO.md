# Demo video: HEEL TURN (target 2:18, window 2:00 to 2:30)

## Finish line (checked against the export before upload)
1. Length 2:00 to 2:30. 16:9, 1080p. Event rule is 1 to 3 minutes.
2. Understandable on mute: every spoken line and every claim has a burned-in caption.
3. On screen at least once: the 5 must-haves (characters, playable game, movement, 3+ agents with goals, decision log),
   the 3 boosters (3D, memory that changes decisions, voice), run it twice, Track 02, every sponsor named.
4. The learning chart appears with N and the memory-off line, and the caption says the effect is small.
5. BAND console and a Bruin run (checks, the blocked bad row, lineage) each on screen.
6. No WWE name, logo, belt, wrestler or music. Original cast only. The battle royal is "Over the Top".

## Shot list

| # | Time | Dur | Capture | Caption | Proves |
|---|---|---|---|---|---|
| 1 | 0:00 | 8 s | Motion first: Vex hits Brutus Kane, hitstop, crowd swell, then the title card (`game/public/art/titantron.jpg`) over the ring. | "HEEL TURN. AI wrestlers that remember how you fight." | characters, 3D, movement |
| 2 | 0:08 | 20 s | 1v1, human vs Old Iron Mae. Entrance with announcer intro, bell, a lock-up (`move-lockup.png` framing), strike exchange, suplex, near-fall with Lou counting. Booth audio up: Rex calls the slam, Dot answers. | "You play. Mae reads your habits. Rex and Dot call it live (Fish Audio voices on Runware)." | playable game, movement, voice |
| 3 | 0:28 | 12 s | Results screen or rail log: Mae's plan rows. Zoom on one row: intent `counter`, reason, cite `habits.p1/opening/strike`. | "Every decision, with the Bruin row it read. 'p1 strikes at the opening bell, so block.'" | decision log, memory |
| 4 | 0:40 | 12 s | Pre-match promo lower-third: a wrestler quotes the human's habit with the Memory chip visible. | "Promos are written from memory. 'You threw the same strike 14 times in the opening.'" | memory changes behaviour, voice |
| 5 | 0:52 | 14 s | Over the Top: 5 wrestlers, a timed entrant drops in, the rail log shows an alliance on the human, then Silas's betrayal proposal. | "Over the Top. Entrants join mid-match. Silas offers an alliance, then plots a betrayal." | 3+ agents with goals, ally and betray |
| 6 | 1:06 | 16 s | The commissioner card. Split screen, same seed: left Approve (Silas tosses his partner, `royal-end-approve.png`), right Block (no betrayal elimination, `royal-end-block.png`). | "A human commissioner approves or blocks. Same seed. Different verdict. Different ending." | run it twice, agent-caused world event |
| 7 | 1:22 | 14 s | Band app on the second screen: the commissioner desk room with `betray-1` waiting, the typed `approve`, then the heel locker room that Kane cannot see. | "Each wrestler is its own BAND agent. Private locker rooms. The commissioner rules in the room." | BAND delete test |
| 8 | 1:36 | 20 s | Terminal: `bash bruin/run.sh` green. `bash bruin/prove_bad_row.sh`: staging FAIL, five marts UPSTREAM FAILED. `python3 bruin/lineage.py` column lineage. Then `docs/learning/counter-rate.svg`. | "Bruin turns fights into checked memory. A bad row blocks the refresh." Then: "32,000 matches: memory adds 1 to 2.5 points. Small, real, measured." | Bruin, learning booster, honesty |
| 9 | 1:56 | 12 s | Second laptop: open the invite link (`?room=CODE&royal=1`), pick a wrestler, both screens show the same ring with AI wrestlers. | "A friend joins by link. 2 humans, 4 AI wrestlers, one ring." | Track 02 must-have |
| 10 | 2:08 | 10 s | Close card: title, "Track 02: Co-op Multiplayer Game", sponsors with one line each, repo URL. | "Bruin: the wrestlers' memory. BAND: rooms, entrants, verdicts. Runware: every voice. AdaL: this video." | track and sponsors named |

## Capture notes
- Record shots 2, 5 and 9 with sound on; every other shot works muted under music. Duck music under speech.
- Shot 6: run `node game/tools/royal_check.mjs` first (it exits 1 unless approve ends in the betrayal toss and block does not), then record both
  verdicts in the game on that seed.
- Shot 7 needs live BAND (`HEEL_BAND_MODE=live`). If the room cap returns 403, run
  `python -m agents.tools.band_rooms list` and show the pool instead of a fresh room.
- Shot 8: run each command once before recording so the terminal output fits one screen.
- The chart SVG needs a PNG for the editor: `convert -density 150 docs/learning/counter-rate.svg docs/learning/counter-rate.png`.
- Tools: OBS at 1080p60, AdaL for the cut, titles and captions.

## Verify before submit
- Timeline between 2:00 and 2:30.
- Mute test: one person watches on mute and explains it back.
- Tick finish-line items 1 to 6 against the export.
- Fallback if live BAND or the second laptop fails: use `docs/lanes/band-demo-output.txt` on screen for shot 7, and
  `docs/shots/royal-online-a.png` + `royal-online-b.png` for shot 9, and say so in the caption.
