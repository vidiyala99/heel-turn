# Candidate B: BAD CREDIT (Track 02, Game)

## Concept
A night-market game where every deal is a spoken promise ("3 saffron by round 4, pay me now"). Two human players and four BAND merchant agents trade IOUs; each round a Bruin pipeline audits every promise against what was delivered and mints a credit score that sets interest rates, who will deal with whom, and what each agent remembers next run. When the merchant Vex's exposure crosses her own threshold she calls in every loan on her own, and the market runs on itself (the agent-caused world event). Pitch line: "Trust is the currency. Bruin is the credit bureau."

## Why it is unique (cliché avoided)
Avoids "agents verify claims/quotes, shown in a Three.js scene" (the most common Telem project) and the Among Us clone (aimogus has that). Nothing here fact-checks the web. The audit is of the agents' own behaviour (said vs did), and it is a game mechanic: a failing Bruin check is an in-world event ("Mint Inspector raids the market"). Bruin is the rules engine, not a dashboard.

## Sponsors: limit-pushing use and on-screen proof
- **Bruin ($1000/$500):** (1) Inference asset runs a model on every default row and returns typed `intent` in {betrayal, bad_luck, bluff, honest} plus `excuse_quality` (their newest feature, used for real); checks `accepted_values`/`not_null` on it. (2) Custom SQL check "goods conserved" (no item created from nothing) fails on injected counterfeit and triggers the raid. (3) Marts `credit_score`, `grudges`, `run_outcomes` feed agent prompts, interest rates and the UI. (4) `bruin query` is the read path. Proof: split screen shows `bruin run` with a check going red, then lineage graph, then the market reacting.
- **BAND ($500):** each merchant is its own BAND agent (own id/key); offers by @mention in the market room; private side-rooms for secret deals and collusion (mention-scoped visibility is a boundary BAND enforces); Vex's call-in is a blockable verdict a peer can veto. Humans join via proxy agents. Proof: BAND console room beside the game, glowing who-talks-to-whom lines. cognee memory is stretch only.
- **Runware ($200):** Gemini TTS with plain-language delivery direction taken from the audit's `intent` ("warm, slightly too fast" when bluffing), so the voice leaks tells; HeyGen Avatar 6 lip-sync on handshake lines (one portrait speaks the promise). Proof: cost-per-run counter in HUD, cached asset hash.
- **Glasser ($100):** goods carry real commodity/price data; a price shock fetches live data. Each call's price is a ledger line ("glasser -$0.004"). Proof: decision log row plus balance.
- **Telem ($500/$300/$100):** "the Wire": Otis reads dated headlines from 2+ engines through Telem to pick which good to hoard; conflicting or stale hits become conflicting tips the humans hear. Proof: Telem console trace linked from the log row.
- **AdaL:** demo cut from a screen capture of run 2. **Teamily:** joined, thread as proof of workflow.

## Impact / invest story
Agents are about to trade, hire and pay each other, and nobody can tell which agent keeps its promises. This is a working credit bureau for agent-to-agent commerce: promise ledger, typed intent audit, portable score, governed in Bruin with lineage. The game is the wedge and the simulator (cheap to generate thousands of counterparty-risk episodes). Analogues: Experian/D&B for the agent economy; first customers are agent marketplaces and agent-payment rails. Honest claim: prototype, scores calibrated only on simulated play. Measured result for the pitch: default rate of agents with memory vs memory off, over N headless runs (stretch).

## Data shape and architecture
`events.jsonl`: event_id, run_id, tick, actor, kind (offer|accept|promise|deliver|default|callin|rumor|shock|audit), counterparty, item, qty, price, due_tick, stated_reason, band_msg_id, cost_usd, world_json.
Bruin pipeline: raw.events (Python asset) -> stg.promises (SQL, checks) -> stg.defaults_judged (inference asset) -> mart.credit_score, mart.grudges, mart.run_outcomes.
Python backend (FastAPI + websocket) holds world state; four agent processes (band-sdk, small fast model); server triggers `bruin run` at round settle (~20 s rounds, 8 rounds) and reads marts with `bruin query`. Vanilla Three.js client: primitive-built stall keepers who walk, gesture, bubble; second human in another browser tab. Decision log panel quotes the stated reason beside the audit's intent.

## Build order (riskiest first, ~5.5 h)
1. 0:00-0:35 Bruin loop alone: JSONL -> run -> query. Check: `bruin run` green, injected counterfeit row turns the conservation check red, run under 8 s. Settle inference-asset vs Python-fallback now.
2. 0:35-1:20 BAND: 4 agents, offer/accept/promise by @mention, one private room, human proxy. Check: handshake visible in BAND console.
3. 1:20-2:20 Headless game loop with defaults, call-in event, grudge-seeded prompts. Check: run twice, ledger differs, goods conserved.
4. 2:20-3:40 Three.js stage, HUD, decision log, two browser tabs. Check: two humans trade with agents live.
5. 3:40-4:20 Runware voice plus one lip-sync line, Glasser and Telem calls. Check: costs and traces appear in log.
6. 4:20-4:50 Cross-run memory demo (run 2 Vex refuses the human who stiffed her); optional ablation numbers.
7. 4:50-5:30 Record, AdaL cut, README listing exact Bruin/BAND features, submit early (order drives judging group).

## Top risks and cut list
Risks: inference-asset syntax unverified (fallback: Python asset calling the model, say so honestly); human-in-BAND-room via proxy is hacky; per-round `bruin run` latency; lip-sync latency/cost; needing a second human for the demo (ask a neighbour; do not fake).
Cut in this order: lip-sync avatar, Telem Wire, live Glasser (use cached snapshot), ablation chart, 3D to 2D sprites, side-rooms, cognee.

## Rejected
- Mary Celeste style claim verifier: the named cliché.
- Among Us/deduction clone: aimogus owns it.
- Film "The Verdict" courtroom: verification again, heavy animation, Film needs divergent endings plus a rendered short in 5 h.
- Grow track negotiation dojo with Casuro: Casuro has no public API, weak Bruin story.
- Kingdom Council/Election Night: voice-heavy, no data hook, thin Bruin.
