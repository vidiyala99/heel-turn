# Multiplayer AI Hackathon: win plan (pstack figure-it-out)

Goal (Aakash, 2026-11-22): win the hackathon and as many sponsor prizes as possible with something creative, fun,
unique, that pushes the sponsor tools to their limits and is not another AI wrapper; then get maximum attention and
organic growth on the video. Event Mon 2026-11-23, AWS Builder Loft SF. Hacking 11:30-13:00, 14:00-18:00.
All project code is written at the event. How we got here: `docs/decisions.tsv`, `docs/arena/`.

## Grounding (all in `prep/`)
- `event-site.md`: 5 must-haves are a gate; boosters 3D / memory / voice; judge form = Presentation, Execution,
  Innovation, Impact, Implementation (20% each) + "how much would you invest"; judging order = submission order.
- `sponsor-signals.md`: Bruin inference assets; BAND cross-tool agents + memory; Runware lip-sync avatars + directed TTS;
  Glasser wants agents that "agree on something real".
- `winner-signals.md`, `wins-scraped.md`: "agents verify claims in 3D" is the Telem cliché; winners make the demo the
  product, show a learning loop with a number, put sponsor tools in the core loop.
- `attention-teardown.md`: the game track wins attention by a wide margin (AI social-deduction videos: YouTube median
  ~400k on an established channel; AI-game Discords 2k-24k members); film is crowded and skeptical; coaching spreads only
  as failure comedy. What spreads: "1 human vs N AIs", betrayal and lying, burned-in captions. A playable link keeps
  growing after the post; a film does not.

## The three tracks, side by side
| | Track 1 Film (TAKE 37) | Track 2 Game (BAD CREDIT) | Track 3 Coaching |
|---|---|---|---|
| Judge score (round 2, /35) | **29** | 27 | not designed (wrapper risk) |
| Impact / invest story | "canon layer" for AI series | **"credit bureau for the agent economy"** | weak |
| Organic attention | medium, crowded | **highest** | lowest |
| Compounds after posting | no (one-shot video) | **yes (play link, Discord)** | no |
| Build risk solo | **lowest (pre-run replay)** | highest (live 2 humans, networking) | medium |

## Decision (23:50): Track 2, BAD CREDIT, de-risked
Base spec: `docs/arena/round2-candidate-B.md`. A night market where 2 humans and 4 BAND merchant agents trade IOUs.
Every deal is a spoken promise; each round a Bruin pipeline audits promises against deliveries and mints credit scores
that set interest rates, who deals with whom, and what each merchant remembers next run. When merchant Vex's exposure
crosses her threshold she calls in every loan on her own (the agent-caused world event).
Pitch: "Trust is the currency. Bruin is the credit bureau." Video hook: "2 humans, 4 AI merchants. One of them is lying."

Why this over the higher-scored film: the goal now includes attention and organic growth, where the game wins clearly
and compounds; it also has the best Impact story. Its two weaknesses get fixed in the design:
1. **Live risk:** rounds are **turn-based** (no realtime sync), so networking is simple polling or a websocket, and a slow
   `bruin run` only lengthens a round. A recorded full game is the backup video.
2. **Second human:** the second human joins from a **phone via QR code**. In the demo, hand the QR to a judge. The risk
   becomes the best moment of the pitch.
**Fallback gate at 15:00:** if BAND or the 2-human loop is not working, switch the stage to TAKE 37's replay mode
(`docs/arena/round2-candidate-A.md`), reusing the same Bruin pipeline and agents.

### Grafted in
- From A (TAKE 37): a measured learning result. A chart from Bruin across runs: defaults per round and how merchants'
  trust in each human changes (memory on vs off). A failed Bruin check becomes an on-screen "Mint Inspector raid".
- From the round-2 judge: the Bruin inference asset's `intent` column (honest / bluff / desperate) sets the Runware voice
  delivery, so voices leak tells; Glasser cost per call shown in the ledger.
- From the attention teardown: burned-in captions, a 25-45 s vertical cut, a play link and a Discord in README and posts.

### Sponsors, pushed
- **Bruin ($1000/$500):** raw deals -> staged promises -> audit mart -> credit scores -> memory mart; checks for goods
  conservation and promise validity (a failure triggers the raid); inference asset for intent; `bruin query` drives rates
  and prompts; lineage graph in the README and video.
- **BAND ($500):** each merchant its own BAND agent; offers by @mention; private side-rooms for collusion; humans join through
  proxy agents; BAND console shown next to the game.
- **Telem ($500/$300/$100):** "the Wire": a merchant reads dated headlines across 2+ engines to pick what to hoard; stale or
  conflicting hits become rumors players hear; trace ids in the log.
- **Runware ($200):** a voice per merchant with intent-driven delivery; portraits; stretch: one lip-sync line.
- **Glasser ($100):** real-world prices seed the market; cost per call in the ledger.
- **AdaL:** the 16:9 cut and the vertical cut.

## Build order (riskiest first; each step ends in a check on the real thing)
| # | Time | Unit | Check |
|---|---|---|---|
| 0 | 9:30-11:30 | At sponsor demos: can one project win several prizes? What does each "best use" judge want? Credits? Telem trace ids? Runware voice param? | Answers logged here |
| 1 | 11:30-12:05 | Bruin loop: deals JSONL -> `bruin run` -> `bruin query`; inference asset or Python fallback decided | Green run; injected counterfeit turns conservation check red; run < 8 s |
| 2 | 12:05-13:00 | BAND: 4 merchant agents, offer/accept/promise by @mention, one side-room, human proxy | Handshake visible in BAND console |
| 3 | 14:00-14:45 | Headless turn-based game loop: defaults, Vex call-in, grudge-seeded prompts | Run twice: ledgers differ, goods conserved |
| 4 | 14:45-15:45 | Three.js market + HUD + decision log; phone join by QR | Two humans (laptop + phone) trade with agents |
| G | 15:00 | **Gate:** if 2 or 4 is red, switch to TAKE 37 replay mode | Decision logged |
| 5 | 15:45-16:20 | Runware intent voices; Telem Wire; Glasser prices | Costs and traces in the log |
| 6 | 16:20-16:50 | Cross-run memory + chart (memory on vs off) | Run 2: Vex refuses the human who stiffed her; chart renders |
| 7 | 16:50-17:30 | Record a full game; AdaL 16:9 + vertical cuts; README sponsor table with file links | Videos exported; links open |
| 8 | by 17:30 | Make repo public; submit early | Submission page shows repo + video |

Cut list, in order: lip-sync line -> Telem Wire -> Glasser prices -> memory-off ablation -> 3D to 2D -> side-rooms.
Never cut: Bruin audit + checks, 4 BAND agents, 2 humans, decision log, video, early submit.

## Attention plan (tomorrow evening, after submission)
Success metric: play-link clicks and Discord joins, not views. Post LinkedIn first (tag sponsors and Crewbase), then X,
then the TikTok/Shorts vertical cut the same night; r/LocalLLaMA and r/IndieGaming next morning with the play link.
Details: `prep/attention-teardown.md`. Posting is outward-facing: Aakash approves each post.

## Run log
| Time | Unit | Verdict | Evidence |
|---|---|---|---|

## Tonight (Aakash)
- [x] Teamily joined; AWS registration done; Bruin installed and verified
- [ ] BAND, Runware (non-Gmail), Telem accounts + keys (Glasser already logged in, $67 balance)
- [ ] AdaL Windows app installed
- [ ] Physical photo ID; a phone for the QR demo
