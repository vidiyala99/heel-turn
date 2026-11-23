# Demo video plan (pstack figure-it-out, 2026-11-23 00:50)

## Phase A: Frame
**Finish line (falsifiable, checked before submit):**
1. Length 2:00-2:30 (hard cap 3:00, event rule "demo video (1-3 min)"). 16:9 master, 1080p.
2. A stranger watching on mute understands it (burned-in captions on every spoken line and every claim).
3. Every judging item is on screen at least once: the 5 must-haves (characters, visual output, movement, 3+ agents with
   own goals, decision log), the 3 boosters (3D, learning/memory, voice), "run it twice", track named, sponsor tools named.
4. Learning shown as a chart with its round count and the memory-off line beside it (no bare claim).
5. BAND console room and Bruin pipeline (checks green, lineage) each on screen, because those judges score evidence.
6. No Valorant name, logo, agent, map or sound anywhere (original game in the genre).

**Grounding:** event demo advice ("open with the agents doing something on screen", "show the decision log", "run it
twice", "say which track and sponsor tools"; prep/event-site.md:51-53); BAND guide ("show the room in the Band console");
Bruin showcase house style ("Bruin Features Used"); attention teardown (number in the hook, captions, betrayal/failure
beats spread; prep/attention-teardown.md).

**Rigor:** high on items 1-6, low on cinematic polish. The video is judge evidence first, social clip second.

## Phase B: Design
### Shot list (target 2:15)
| Time | Shot | What it proves |
|---|---|---|
| 0:00-0:08 | **Hook:** a round already in motion, AI heroes rotating on the map, a voice callout. Caption: "1 human + 4 AI heroes. They learn how you play." | characters, movement, voice, 3D |
| 0:08-0:25 | **Talk to them:** Aakash holds push-to-talk: "they stacked A, fake A, hit B". Heroes answer in their own voices, one pushes back, the plan panel updates, they execute the fake. | agents with own goals, humans + agents in one world, live response |
| 0:25-0:45 | **Inside the team room:** the BAND console beside the game: the caller's plan, the support's veto, Aakash approving. | BAND delete-test signals, decision log |
| 0:45-1:05 | **The enemy's hidden plan revealed** after the round: what the enemy AI said about Aakash ("he always peeks mid"). | agents with goals, memory, drama |
| 1:05-1:30 | **Learning, proven:** the Bruin pipeline turning rounds into habit tables (checks green, lineage), then the chart: prediction accuracy across N rounds vs memory off. | ML/memory booster, Bruin, honesty |
| 1:30-1:50 | **Run it twice:** same opening, round 1 vs round 12 side by side; the AI defends the site it learned he favors. | not scripted |
| 1:50-2:05 | **A friend joins by link** on a second laptop; 2 humans + AI heroes in one match. | Track 2 must-have |
| 2:05-2:15 | **Close:** title card: name, "Track 02: Co-op Multiplayer Game", sponsor logos with one line each (Bruin: learns your habits; BAND: team rooms + veto; Runware: voices; AdaL: this video), repo link. | track + sponsors named |

### Build the lever (do not hand-capture at 17:00)
1. **Replay + director camera** built into the game: every round is saved (it is already the Bruin event stream), and a
   replay mode re-renders it with a free camera. Footage becomes reproducible and clean, no lucky takes.
2. **Capture as you go:** each build unit's check produces its clip (multiplayer works -> record the 2-laptop shot;
   AI layer works -> record the voice-comms shot). By 16:50 most shots already exist.
3. **Headless bot-vs-bot batch** produces the learning chart data early, so the chart is ready before the final cut.
4. Tools: OBS (free) for capture at 1080p60; AdaL for the cut, titles and captions (required tool, competes for its prize);
   ffmpeg for the vertical 25-45 s social cut from the same master.

### Script rules (Experience First: fewer, better shots)
- First frame is motion, never a title card or a talking head.
- Every claim is shown, then captioned; no voice-over claim without a visual.
- One idea per shot; cut on action.
- Keep in-game voices audible under music; duck music under speech.

## Phase C: Run the loop (at the event)
| Unit | Clip produced | Check |
|---|---|---|
| Multiplayer works | 0:00 hook rough + 1:50 two-laptop shot | two browsers in one match on screen |
| AI strategy layer | 0:25 BAND console shot | veto + approval visible in the room |
| Voice comms | 0:08 talk shot | reply under 3 s, measured |
| Bruin learning loop | 1:05 pipeline + chart | checks green, chart has N and baseline |
| Replay mode | 1:30 side-by-side | same opening, different defence |

## Phase D: Audit trail
One row per clip in docs/decisions.tsv (clip, check, file path, result).

## Phase E: Verify before submit (16:50-17:30)
- Timeline under 3:00 (target 2:15).
- Mute test: one person watches on mute and explains it back.
- Checklist pass: all items 1-6 above ticked against the actual export.
- Then the vertical social cut and upload; submit by 17:30.

**15:00 fallback:** if multiplayer is not ready, swap the 1:50 shot for bots vs bots plus one human and say so in the caption.
