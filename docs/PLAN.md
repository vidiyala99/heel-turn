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
   an on-screen decision ledger (who decided what and why), an exhibit stamped INADMISSIBLE by a Bruin check, and two takes with different verdicts.
2. The different ending is caused by memory: a later take's decisions cite credibility rows Bruin produced from earlier takes.
3. The repo README has a "Sponsors" table: one row per sponsor, each linking to the file where it does real work.
4. `bruin run` passes its quality checks on the take data, live, in the demo or the video.

### Rigor
High on disqualifiers (Bruin used, public repo, video, deadline), because missing one zeroes everything.
Low on polish beyond the demo path. One checkpoint: the idea, below, before coding starts at 11:30.

## Decision: arena result (2026-11-22 23:20)
pstack figure-it-out says a one-way-door design gets an arena. Two independent designs (Opus, Sonnet) plus this
plan's original "Takes" idea were scored by a Sonnet judge on 6 criteria (`docs/arena/judge.md`):
**A Mary Celeste Inquiry 26/30**, B Last Pod 25/30, C Takes 18/30. Takes lost on Bruin depth, delight and optics.

**Base: A, "The Mary Celeste Inquiry"** (full spec: `docs/arena/candidate-1.md`, Track 1 film). Six BAND agents
re-stage the 1872 ghost-ship inquiry on a 3D deck. An exhibit counts only if a Bruin check proves its quote is in the
page the agent fetched through Telem, so invented evidence gets stamped INADMISSIBLE on screen. The Judge rules only
from Bruin metrics. Credibility carries across takes, so endings change. Real history, no living people.

**Grafted in:**
1. From B: physical beats (tilting deck, characters crossing to the board and stand, a finale) so it is not talking heads.
2. From B: a dummy-agent take first, and a recorded replay with cached voices as the primary demo; the live take is a bonus.
3. From B: an endings histogram over 5-8 takes, and a within-take trust mart.
4. From C: `memory_refs` on every event, and the 9:30-11:30 sponsor-prize questions.
5. Judge fix: BAND decides turns (the Judge agent picks the next speaker); our code only observes. Engine-driven turns fail BAND's "delete test".

**Verified tonight:** a failing Bruin check marks its asset failed and skips everything downstream
(`UPSTREAM FAILED`), so "check failure blocks the exhibit" works as designed (probe: `prep/bruin/probe`).
`bruin query` has `--semantic-model`, `--metric`, `--dimension` flags (from `--help`); the semantic model file format
is still unverified, with SQL on the mart as fallback.
**Still unverified:** Telem trace id in the API response, Runware per-voice parameter, BAND SDK on Windows.

## What judges score (grounded 2026-11-22 23:30; sources `prep/event-site.md`, `prep/sponsor-signals.md`)
1. **Gate, not points:** 5 must-haves in every track (characters, visual output, movement, 3+ agents with own goals,
   visible decision log). The site's self-check marks a project "not eligible" below 5/5.
2. **Boosters:** 3D, learning/memory that changes decisions, a distinct voice per agent.
3. **Judge form** (submission platform bundle; may be the platform default): 0-100 on **Presentation, Execution,
   Innovation, Impact, Implementation**, plain average (20% each), plus a separate "how much would you invest" leaderboard.
   So the pitch needs an Impact/investable story, not only a fun film.
4. **Pitfalls the site names:** chatbot with a face; secretly scripted plot ("run it twice"); text-only agents; invisible reasoning.
5. **Demo advice from the site:** open with agents moving/deciding, show the decision log, run it twice, name track + sponsor tools.
6. **Mechanics:** judging groups follow submission order, ~5 min per project. **Submit early.** Submission asks which sponsor
   tools you used and how. A Teamily agent thread counts as proof of how the human + agent team worked.
7. **Sponsor signals (what each team is pushing this week):** Bruin inference assets (a model fills a typed column per row);
   BAND persistent memory across rooms via cognee, multi-agent handoffs; Runware HeyGen Avatar 6 lip-sync and directed
   Gemini TTS, and it sponsors an AI film award; Glasser posted about this hackathon ("agents agree on something real").

### Changes to the design from grounding
- Keep base A (re-scored against the real rubric; Innovation and Presentation strong). Raise **Impact**: pitch the
  mechanic, "agents that cannot cite what they did not verify", as evidence-gated deliberation for any multi-agent
  decision; the 1872 inquiry is the demo.
- **Bruin:** add an inference asset that classifies each exhibit's theory and stance as a typed column, with checks on it.
- **BAND:** use the cognee integration so each character's memory outlasts the room across takes (BAND's own push).
- **Runware:** directed TTS per character; stretch: Avatar 6 lip-synced close-up when a character speaks.
- **Demo:** run two takes side by side to prove it is unscripted; name sponsors on screen. Submit by ~17:30, not 17:55.
- **Teamily:** keep a short agent thread during the build as the human + agent proof (cheap).
- Glasser stays cut unless a real data need appears ($100, no fit for 1872).

## Phase B: Build order (from A, riskiest first, each step ends in a check)
| # | Time | Unit | Check |
|---|---|---|---|
| 0 | 9:30-11:30 | Ask sponsors: can one project win several prizes? What does "best use" mean to each judge? Credits? | Answers in this file |
| 1 | 11:30-12:05 | Bruin over a fixture (2 sources, 3 exhibits, 1 forged quote) | `bruin run` passes; forged row `quote_found=false`; metric returns in <10 s |
| 2 | 12:05-12:35 | BAND: 2 registered agents @mention, one calls a tool, observer writes JSONL | Console room shows it; JSONL has the lines |
| 3 | 12:35-13:00 | Telem `research()` stores a real fetch | Real quote passes Bruin, invented one fails, trace id saved |
| L | lunch | Runware asset script: portraits, ship GLB, 6 voice samples | Files on disk |
| 4 | 14:00-15:00 | Full cast, one take (dummy agents first, then LLM) | Verdict reached, at least 1 exhibit rejected, marts refresh per round |
| 5 | 15:00-16:15 | Three.js stage: deck, moves to marks, bubbles, board stamps, ledger, replay | Full take replays at 1080p, no console errors |
| 6 | 16:15-16:45 | Voices per line; 4 more takes in background | `mart_run_outcomes` shows 2+ endings; credibility shifts |
| 7 | 16:45-17:20 | Record take 1 vs take N; AdaL cut 90-150 s | Video exported |
| 8 | 17:20-17:45 | README sponsor table with file links; make repo public; submit | Submission page shows repo + video |

### Cut list, in order
Ship GLB -> side-room collusion -> live take (replay only) -> Runware voices (browser speech) -> endings chart.
Never cut: Bruin checks gating exhibits, Telem as the only fact source, 6 BAND agents, the ledger, video, submission.

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
