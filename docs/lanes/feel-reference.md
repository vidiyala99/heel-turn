# Feel reference: console wrestling grapple pacing

Reference only. Copy feel and mechanics, never assets or names into product code.

## Source
- Video: https://www.youtube.com/watch?v=aL7q7RRI9qE ("WWE SmackDown! Here Comes the Pain | Brock Lesnar vs. Rey Mysterio Full Match", PS2, 10:39).
- Footage studied: video 2:55 to 4:15 (match starts about 2:55). Frames sampled at 4 fps (0.25 s resolution) from a 480p download. Times below are seconds from video 2:55, written m+t; the in-game clock reads about m+t+4 s. Audio RMS measured in 50 ms windows.
- Limits: 4 fps cannot resolve single frames, so hitstop of 2 to 4 frames is NOT measurable here. Camera shake and audio transients are only coarsely observed. One 80 s excerpt, one match, one pair of wrestlers. Times are approximate (plus or minus 0.25 s).

## Observations
1. Lock-up is one paired animation. At m+12.0 to m+14.0 (about 2.0 s) both bodies stand chest to chest in a single locked pose (collar-and-elbow tie, heads and shoulders fixed relative to each other), then one throw plays out from that pose. The bodies never drift apart or clip mid-tie; they move as a single rig.
2. The sim waits for the animation. During the carry-and-slam at m+6.0 to m+8.0 (about 2.0 s) and the shoulder-lift slam at m+16.25 to m+17.25 (about 1.0 s), neither wrestler is steered, the opponent is carried by the attacker's pose, and the next action starts only after both are back in a free state.
3. Moves are discrete and readable. Sequence seen: lock-up, throw (m+14.0), run and catch (m+14.5 to m+16.25), shoulder-lift slam (m+16.25 to m+17.25), ground time, pick-up. Each beat has one clear silhouette held for 0.25 s or more; no beat is a blend of two actions.
4. Impact frame. The slam landing at about m+17.0 shows a sharp audio spike (about 2x baseline RMS for roughly 50 to 100 ms) on the landing frame, followed by a crowd swell (about 2x baseline) at m+17.5. After the first landing (m+8.0) the crowd swell peaks at m+8.9 to m+9.4 (about 2.7x baseline), 0.9 s later. Visually the landing is a hard cut to the wide shot with both bodies flat. Hitstop and camera shake: not resolvable at 4 fps (unverified).
5. Camera stability. Lock-ups and strikes use a steady wide shot with minimal drift. Only the signature carry/slam (m+6.0 to m+8.0) uses a tight, swinging, motion-blurred camera that follows the move, then hard-cuts back to wide at the landing (m+8.0). Stable by default, dramatic only for the big move, wide again at impact.
6. Recovery and get-up timing. Victim ground time after the first slam: about 3.5 s (m+8.0 to about m+11.5) before the attacker pulls them up. After the m+17.25 slam the victim stays down about 5.5 s (to about m+22.75, when a kneel begins). The attacker is back to a standing pose within 0.5 to 1.0 s of landing and then waits or walks. Attacker recovery is much shorter than victim recovery, which creates the initiative window.
7. No idle twitching during moves. While a paired animation plays, neither body shows idle sway, jitter or foot shuffle. The downed victim lies still for seconds (a slow roll or settle in the first 0.5 s only), and the standing attacker holds a nearly static pose while waiting.
8. Strike versus grapple length. Strikes in the clip are short, roughly 0.25 to 0.5 s each (hit, recoil, reset; first exchange at about m+0.5 to m+1.5). Grapples are long: lock-up about 2.0 s plus a move of 1.0 to 2.0 s, so about 3 to 4 s of committed animation per grapple. Rough ratio 1:6 to 1:8.

## Rules to carry into the game (feel and mechanics only)
- Lock-up: one paired rig, about 2.0 s, no independent per-body motion.
- Gate the sim on the move animation; no input or AI steering of either body until it finishes.
- Slam move length 1.0 to 2.0 s; strike length 0.25 to 0.5 s.
- Impact: audio spike on the landing frame (50 to 100 ms), crowd swell 0.5 to 0.9 s later; add a small hitstop and shake as tunables (the reference could not measure them).
- Camera: steady wide by default, close and moving only for a signature move, hard cut back to wide at landing.
- Victim ground time 3.5 to 5.5 s; attacker back to neutral in 0.5 to 1.0 s.
- Freeze idle animation layers (sway, twitch) for both bodies while a paired animation runs.
