# Multiplayer AI Hackathon: win plan (pstack figure-it-out)

Goal (Aakash, 2026-11-22 23:09): win the hackathon, as many sponsor prizes as possible.
Event: Mon 2026-11-23, AWS Builder Loft SF. Hacking 11:30-13:00 and 14:00-18:00 (5.5 h). Submit public repo + demo by 18:00.
Rule that shapes everything: all project code is written during the event. Tonight is research, accounts and this plan only.
Sources: luma.com/finch-jd7i (read 2026-11-22), `prep/sponsors.md` (sponsor docs research).

## Phase A: Frame

### Key finding: every listed prize is a sponsor prize
The Luma page lists no overall or track winner. The cash is all "best use of X". So the track only matters for
risk and fit, and the score that matters is how deeply each sponsor is used and how clearly the demo shows it.

| Prize | Amount | Target? | Why |
|---|---|---|---|
| Bruin | $1000 / $500 | **Yes, primary** | Mandatory anyway; biggest pot. Make it the agents' memory, not a logger. |
| Telem | $500 / $300 / $100 | **Yes** | Agents pull real live web data that changes the story. Three places to land. |
| BAND | $500 | **Yes** | Each character is its own BAND agent; they talk by @mention; the room log is the decision ledger. |
| Runware | $200 | **Yes** | Character voices (TTS) and portraits/props. |
| AdaL | Pro plans | **Yes** | Required demo-video tool; costs nothing extra to compete. |
| Glasser | $100 | Stretch | Only if a real data lookup fits; cut first. |
| Lingcode | $200 | No | App builder, off-theme for a multi-agent visual build. |
| Teamily, Casuro | TBD | No | No public build API found. |
| Finch | none | No | Wallet setup; no prize. |

Reachable cash if every target lands at the top: about $2,700 plus AdaL Pro.

### Definition of done (falsifiable)
By 17:55 the submission site shows a public repo URL and a demo video, and:
1. The video (1-3 min, cut in AdaL) shows at least 3 animated 3D characters moving and speaking in distinct voices,
   an on-screen decision ledger (who decided what and why), and two takes of the same setup with different endings.
2. The different ending is caused by memory: take 2's decisions cite rows Bruin produced from take 1.
3. The repo README has a "Sponsors" table: one row per sponsor, each linking to the file where it does real work.
4. `bruin run` passes its quality checks on the take data, live, in the demo or the video.

### Rigor
High on disqualifiers (Bruin used, public repo, video, deadline), because missing one zeroes everything.
Low on polish beyond the demo path. One checkpoint: the idea, below, before coding starts at 11:30.

## Idea: pick by risk, since prizes don't depend on track

| | Film: agents write the plot | Co-op game: 2 humans + 3 agents | Coaching: agents train a human |
|---|---|---|---|
| Live-demo risk | **Lowest**: decisions run ahead, render and record | Highest: realtime networking for 2 humans | Medium: realtime voice loop |
| Bruin as memory across takes | **Natural** (take N learns from take N-1) | Good (economy data) | Good |
| "Different endings" built into the brief | Yes | No | No |
| Fits 5.5 solo hours | **Yes** | Tight | Possible |

**Recommendation: Track 1, Agent Animated Film, as "Takes".** A small cast (heist crew with a hidden traitor, or
another setup Aakash prefers) plays the same opening several times. Between takes, Bruin turns what happened into an
`agent_memory` table, so the characters remember who betrayed whom and change their choices. The film shows
take 1 against take 3. Telem pulls a real live headline that sets each take's opening event, so no two runs start
alike. This hits every required element and all three bonuses (3D, voice, learning) with the least that can break live.
Setup/cast/world is Aakash's taste call; the pipeline below is the same for any cast.

## Phase B: Design

### Data shape first
`DecisionEvent { take: int, t: float, agent: str, action: str, target: str|null, line: str, reason: str, memory_refs: [str] }`
Every layer reads or writes this: BAND messages produce it, Bruin ingests it, the 3D stage replays it, the ledger shows it.

### Units, riskiest first (each ends in a check)
| # | Time | Unit | Check (on the real artifact) |
|---|---|---|---|
| 0 | 9:30-11:30 | At sponsor demos ask: can one project win several sponsor prizes? What does each judge want for "best use"? Any event credits? | Answers written into this file |
| 1 | 11:30-12:15 | BAND: 3-4 characters as separate BAND agents, @mention-routed, play one scene, emit DecisionEvents | Room log shows 10+ messages across 3+ agents; events JSON written |
| 2 | 12:15-13:00 | Bruin pipeline: raw events -> checked decisions -> `agent_memory` and `take_outcomes`; semantic metrics (e.g. trust by character) | `bruin run` all checks pass; `bruin query` returns memory rows |
| 3 | 14:00-15:30 | 3D stage (three.js + free rigged glTF characters) replays a take's events: move, act, face, subtitles, ledger panel | Screen recording of one take, 3+ characters moving |
| 4 | 15:30-16:15 | Runware TTS voice per character; Telem headline sets the opening event | Take plays with 3 distinct voices; opening cites a live headline URL |
| 5 | 16:15-17:00 | Memory loop: run takes 1-3, characters read `agent_memory` before deciding; ending changes | Take 3 ending differs and its events cite take-1 memory rows |
| 6 | 17:00-17:40 | AdaL demo video (1-3 min); README sponsor table with file links | Video exported; every table link opens the right file |
| 7 | 17:40-17:55 | Submit on hackathons.crewbasecollective.com | Submission page shows repo + video |

Fan-out: units 3 and 4 can run as parallel workers on separate branches once unit 1's event shape is fixed.

### Cut list, in order, if behind
Glasser -> Runware TTS to browser speech -> Telem to a fixed headline -> 3D to 2D sprites (loses a bonus) -> takes 3 to 2.
Never cut: Bruin memory, BAND agents, video, submission.

## Phase C/D: Run log
Append a row per unit as it lands (time, unit, check result VERIFIED / NOT VERIFIED / INCONCLUSIVE, evidence path).

| Time | Unit | Verdict | Evidence |
|---|---|---|---|

## Tonight (Aakash)
- [x] Teamily joined; AWS registration done
- [x] Bruin 0.11.831 installed; sample pipeline passes; `bruin query` verified (prep/bruin)
- [ ] BAND, Runware (non-Gmail), Telem, Glasser accounts + keys
- [ ] AdaL Windows app installed
- [ ] Physical photo ID packed
