# Sponsor integration cheat sheet: Multiplayer AI Hackathon, 2026-11-23

Researched 2026-11-22 from official docs/GitHub via TinyFish. Nothing signed up, no cards entered, no code written.
Brief revised: project is NOT job-related and the track is not chosen. "Fit" below is generic multi-agent visual experience, mapped to all three tracks (T1 agent-written animated film, T2 co-op human+agent game, T3 agents coaching a human).
Event: AWS Builder Loft SF (525 Market St), 9:30 AM. Hacking 11:30-1:00 and 2:00-6:00. Submit public repo + demo by 6:00 PM. Demos 6:00-8:30.
Rules/prizes source: https://luma.com/stxaoop0

## Hard facts from the event page (verified)
- Bruin is MANDATORY. Other sponsor tools only count for their own prize. AdaL is required for the demo video.
- Every project needs: visible characters (2D/3D), visual output (video/simulation/game), characters that move and act on screen, 3+ agents with own goals/roles/personalities, a visible decision log/ledger showing what agents decided and why.
- Scores higher with: 3D, learning/memory that changes later decisions, agents with their own voices.
- T1: 1-3 min animated short, agents decide every plot beat, same setup gives different endings across runs. T2: 2+ humans and 3+ agents in one visual world, agents have own goals/memory, can ally/trade/betray, one major world event caused by agents alone. T3: agents as expert roles, 2-3 coordinate about the human, adapt to the human, end with result + evidence-based feedback.
- All code written during the event (libraries/APIs fine). Teams of 1-4.
- Prizes on the page: Bruin $1000/$500, BAND $500, AdaL Pro plans (1yr/6mo/3mo). "More prizes TBD".
- VERIFIED on luma.com/finch-jd7i (main session, 2026-11-22): Bruin $1000/$500, BAND $500, Telem $500/$300/$100, Runware $200, Lingcode $200, Glasser $100, AdaL Pro plans, Teamily + Casuro TBD. Lingcode IS a listed sponsor.
- Required before the event: Teamily signup + join group, AWS registration, physical government photo ID (no digital ID), 18+.

## Summary table

| Tool | What it is (technical) | Setup tonight? | Install / minimal call | Docs | Fit (generic, all tracks) |
|---|---|---|---|---|---|
| **Bruin** (MANDATORY) | Open-source (Apache 2.0) CLI: ingest + SQL/Python transforms + quality checks + lineage; assets are files in git; `bruin mcp` MCP server; Bruin Cloud adds AI analyst | YES: install CLI, `bruin init`. Cloud optional ($100 credit + 50 AI tasks, no card) | `curl -LsSf https://getbruin.com/install/cli \| sh` (Windows: Git Bash or WSL); `bruin init default x`, `bruin run` | https://getbruin.com/docs/bruin/ ; MCP: .../getting-started/bruin-mcp.html | Event/decision ledger + agent memory + run analytics pipeline (see below) |
| **BAND** | Agent-to-agent comms layer: rooms, @mention routing, persistent agent identity, replayable event log. Python `band-sdk` (3.11+), TS `@band-ai/sdk`; adapters for LangGraph, CrewAI, Anthropic, Claude Agent SDK | YES: free signup, no card, register agents | `pip install "band-sdk[anthropic]"`; `Agent.create(adapter=AnthropicAdapter(...), agent_id=, api_key=)`; `await agent.run()` | https://band.ai/hacker-guide ; https://github.com/band-ai/band-sdk-python | Each character = own BAND agent; negotiation/deliberation/betrayal happens in rooms; humans join rooms too |
| **Telem AI** | HTTP router over search providers (exa, brave, perplexity...) + fetch router + observability console/traces | YES: API key in console (no card; upstream cost only) | `curl -fsSL https://docs.telem.ai/install.sh \| sh` or `pip install telem-sdk`; `POST https://router.telem.ai/v1/search`, Bearer key | https://docs.telem.ai/quickstart | Characters/world grounded in live web facts; per-agent traces as extra "why" evidence |
| **AdaL** | Desktop video agent (Mac, Windows x64, Linux) + coding CLI. Not an API. Required for the demo video | YES: install desktop, sign in, test export | Windows: https://adal.sylph.ai/download/desktop/windows ; free tier, uses your ChatGPT plan | https://adalagent.ai ; https://docs.sylph.ai | Cut the demo video; T1 deliverable can also be edited in it |
| **Runware** | One REST/WebSocket endpoint (`https://api.runware.ai/v1`) for image, video, audio/TTS, 3D, LLM; JS + Python SDKs; hosted MCP mcp.runware.ai | YES: signup with BUSINESS email for $2 credit, no card | `pip install runware` or `npm i @runware/sdk-js`; `{"taskType":"audioInference","model":"fishaudio:s2.1@pro","speech":{"text":"..."}}` | https://runware.ai/docs/models-api/introduction | Character portraits/sprites, GLB props/sets, per-agent TTS voices, optional video clips |
| **Glasser** | Broker: one key, 2,000+ paid data endpoints (people, company, finance, SEO, social, maps...). CLI `@glasser-ai/cli`, MCP `https://api.glasser.ai/mcp` | YES: signup, $1 free credit | `npm i -g @glasser-ai/cli`; `glasser login`; `glasser search / inspect / run` | https://glasser.ai/SKILL.md | Real-world data as world state (prices, news, places); every paid call is a ledger line |
| **Casuro** | Recruiting SaaS (voice AI career pages, assessments, ATS sync). Public docs = ATS only; no dev API found | OPTIONAL: business-email signup, no card | UNVERIFIED: no public API. Reference: https://github.com/casuro/interview-prep-voice-ai (LiveKit + OpenAI Realtime voice agent) | https://docs.casuro.ai | Weak/off-theme unless T3 coaching; reference for realtime voice architecture only |
| **Finch** (host + sponsor) | Marketplace for agent Skills/Agents/Tasks; `@finchtech/cli` + remote MCP; wallet/chain custody | NO (skip) | `npm i -g @finchtech/cli`, `finch wallet create`, `finch login` | https://www.finchtech.ai/en/story/cli-mcp | Weak: package a character/behaviour as a Skill (roadmap mention only) |
| **Teamily** | Human+agent messenger; official event comms | YES, REQUIRED | https://teamily.ai/i/78ACUM then https://teamily.ai/invite/group/4189592498 | https://teamily.ai | Not a build tool (API UNVERIFIED) |
| **Lingcode** | Mac-first AI app builder | NO | n/a | https://lingcode.dev | Listed sponsor ($200), but off-theme for a multi-agent visual build |

---

## Bruin (the one that must be good)

**What it is.** CLI first. A project is a folder with `.bruin.yml` (connections) and `pipelines/<name>/pipeline.yml` + `assets/`. Asset types: `ingestr` YAML (70+ sources), SQL (`duckdb.sql` etc. with `materialization`, `depends`, column `checks`), Python (`"""@bruin ... @bruin"""` header, `def materialize(): return dataframe`, run under `uv`, deps via `pyproject.toml`). Built-in checks (`not_null`, `unique`, `accepted_values`, etc.), lineage, `data-diff`, dry-run. `bruin mcp` is a stdio MCP server inside the CLI (query data, compare tables, ingest, build pipelines). SQL, Python, R. Apache 2.0.
**Auth.** CLI needs none; connections (DuckDB, BigQuery, Postgres...) in `.bruin.yml`. Bruin Cloud: personal access token or OAuth; Cloud MCP `https://cloud.getbruin.com/mcp`.
**Signup/credit.** Cloud: "$100 in credits and 50 AI tasks. No credit card" (getbruin.com). Not needed for the CLI.
**Windows gotcha (you are on Windows).** Run the installer in Git Bash or WSL. For MCP use the full path from `cygpath -m "$(which bruin)"` (bare `bruin` often fails to start in GUI apps). Claude Code: `claude mcp add --scope user bruin -- "$(which bruin)" mcp`.
**Quickest surface (10 min tonight):**
```
curl -LsSf https://getbruin.com/install/cli | sh     # Git Bash
bruin init default my-pipeline && cd bruin/my-pipeline
bruin run
```
First run downloads uv/ingestr/duckdb tooling into `~/.bruin`; do it tonight so venue wifi is not the bottleneck.

**What "best use of Bruin" credibly looks like** (judges will see many "ran bruin init" projects; make Bruin load-bearing, not decoration):
1. **The decision ledger is a Bruin pipeline.** The app emits raw events (run_id, tick, agent_id, action, target, stated_reason, outcome, world_state_json). `bruin run` after each run/round builds: `raw.events` (Python/ingestr asset reading JSONL), `stg.decisions` (SQL, checks: `not_null` on agent_id/run_id, `accepted_values` on action, `unique` event_id), `mart.agent_memory` (per-agent rolling facts: who betrayed whom, favours owed, win/loss, trust score), `mart.run_outcomes`. The UI's "why" panel reads the mart, so the ledger the rules require is a governed, checked table with lineage.
2. **Memory that changes decisions (scores higher).** Before each agent acts, its prompt is seeded from `mart.agent_memory` (a query over the mart). Across runs, behaviour visibly changes (grudges, alliances, learned strategy). This is the "learned/adapt/memory" rubric item implemented in the data layer. BAND's own Memory API is Enterprise-only, so Bruin is the memory store.
3. **Cross-run analytics, per track:** T1: `mart.run_outcomes` proves "same setup, different endings" (distribution of endings over N runs, plot in a chart). T2: leaderboard + "major event caused by agents alone" as a flagged row with its causal decision chain. T3: per-skill trend across sessions and the evidence rows cited in the final feedback.
4. **Quality gate.** Narration/feedback/captions only cite rows that passed checks; show `bruin run` output with checks green and the lineage graph (VS Code extension / `bruin lineage`) on a slide.
5. **Agent-facing analyst.** `bruin mcp` wired into the coding agent for build-time analysis, and optionally one in-world agent ("referee"/"narrator") that runs a read-only query on the mart. Bruin Cloud AI analyst is the polished route but needs Cloud/warehouse setup; UNVERIFIED that it works against a local DuckDB file; treat as stretch.
6. README: list exactly which Bruin features are used (Python/SQL/ingestr assets, checks, materialization, lineage, MCP). Judges score from the repo.
UNVERIFIED: exact `bruin query` flag shape (docs confirm CLI can run queries); run `bruin query --help` tonight.

## BAND

**What it is.** Hosted collaboration layer. Register **Remote Agents** at app.band.ai/agents (each gets `agent_id` + `api_key`, key shown once). Your code runs the agent locally via an adapter (`LangGraphAdapter`, `AnthropicAdapter`, `ClaudeSDKAdapter`, `CrewAIAdapter`, ...); `await agent.run()` opens a websocket. Agents talk in **rooms** by `@mention` (only mentioned agents see a message). Built-in tools: `band_send_message`, `band_send_event` (thoughts/progress, shows as events), `band_add_participant`, `band_lookup_peers`, `band_create_chatroom`. Humans in a room see everything; log is replayable in the console.
**Auth/limits.** Free, no card. Up to 10 agents on free. Bring your own LLM key.
**Caveats.** Python 3.11+. Band Desktop (coding-agent app) does NOT support Windows; irrelevant, you want the SDK. Memory API (`band_store_memory`) is Enterprise-only: do not plan on it.
**Install:** `pip install "band-sdk[anthropic]"` (or `npm i @band-ai/sdk`). Keep `agent_config.yaml` and `.env` out of git.
**Judging hint (official hacker guide "meaningful use", delete-test):** strong = dependent handoff, roster decided at runtime, boundary Band enforces (mention-scoped visibility), a verdict that can be blocked. Not counted: one process wearing hats, your own orchestrator calling agents in turn, status posts, dashboard-only deliverable. So register every character as its own BAND agent (own id/key) and route by @mention.
**Fit across tracks:**
- T1: characters are BAND agents in a room; plot beats emerge from mention-driven exchanges; a "director/critic" agent can veto a beat. Private side-rooms (`band_create_chatroom`) for secret scheming (traitor in the heist) = a boundary Band genuinely enforces.
- T2: human players join the same room as the agents (humans are first-class participants); alliance offers/trades/betrayals are messages; side-rooms for private deals.
- T3: panel/coach agents deliberate in a room about the human's performance; a chair agent @mentions the human with the verdict.
- Show the Band console room in the submission (guide says that is the expected evidence); mirror room events to the on-screen log.

## Telem AI

**What it is.** API gateway for agent web access: `POST https://router.telem.ai/v1/search` (pick `providers.include` e.g. exa/brave/perplexity, or `auto_routing:"accuracy"`) and `POST /v1/fetch` (URLs in, clean markdown out). Every call lands as a trace in the console (app.telem.ai) with quality metrics. Install paths: installer script (Claude Code/Codex/OpenCode plugins), MCP, `npx skills add https://docs.telem.ai`, `pip install telem-sdk`, JS, REST.
**Auth/cost.** Bearer API key, project-scoped. "No credit card required, top up only when you need more"; pay upstream rate, no platform fee. UNVERIFIED: event credits.
**Quickest:** make a key, run the quickstart curl (`TELEM_API_KEY`, `TELEM_BASE_URL=https://router.telem.ai`; curl does not default the base URL). Use Git Bash on Windows for the installer.
**Fit (non-gimmick):** agents that need real facts at run time call search/fetch as a tool: T1 a story world seeded from a real historical event/place so characters talk about real details; T2 a trading/survival world whose goods, events or names come from live web data and agents "look things up" mid-game; T3 a coach/examiner fetching the actual source material for the subject being taught. Each call is a logged tool use plus a Telem trace, which doubles as visible "why did the agent know that" evidence. Do not make it the core mechanic; it is a tool agents occasionally use.

## AdaL

**What it is.** Desktop video agent (describe a video; it generates/edits, branch/version control, asset library) plus coding CLI (`SylphAI-Inc/adal-cli`). No dev API relevant here; it is the demo-video tool. Pricing: Free, Pro $20, Max $100; "Start free with your ChatGPT plan" (ChatGPT plan edits/builds, AdaL credits generate new media).
**Platform.** Landing page says "Download for macOS" but download page and blog confirm Windows 10/11 x64: https://adal.sylph.ai/download/desktop/windows (`AdaL-Setup-x64.exe`). Changelog mentions Windows fixes and slow first start after install.
**Tonight:** install, sign in, make and export a 10-second test.
**Plan:** record a clean screen capture of the full run ~4:30 PM, have AdaL cut a 60-90 s demo (hook, character/ledger beats, BAND room, Bruin checks/lineage, ending). Reserve ~5:00-5:40 PM. For T1 the film itself can be recorded from the simulation and polished/narrated in AdaL.

## Runware (image, 3D, voice)

**What it is.** One endpoint for 400K+ models. Array of task objects: `imageInference`, `videoInference`, `audioInference`, `3dInference`, `textInference`. Model addressed `creator:family@version`. JS SDK `@runware/sdk-js`, Python `runware`, REST/WebSocket, hosted MCP `mcp.runware.ai` (OAuth), CLI, Skills. Output URLs kept 7 days by default (download assets).
**Auth/credit.** API key from dashboard. $2 free test credits with a BUSINESS email, no card (runware.ai/llms.txt). Personal gmail may not qualify: UNVERIFIED; use a non-gmail domain.
**Voice (doc-verified shape):** `audioInference` with `model:"fishaudio:s2.1@pro"` and `speech.text` returns an mp3 URL (~$0.0003 per short line). Docs list TTS from MiniMax, Gemini TTS, Fish Audio plus voice cloning. UNVERIFIED: parameter for per-character voice selection; read https://runware.ai/docs/en/audio-inference/api-reference and pick 3+ distinct voices tonight.
**3D:** `3dInference`, e.g. `tripo:v3.1@0` text-to-3D returns a `.glb` (~$0.30/asset). Only 7 3D models on the platform; image-to-3D also listed. My inference (not docs): generated GLBs are usually static un-rigged meshes, so do not count on skeletal animation. For "movement and action" drive a stylized rig/primitives you control (walk, turn, gesture, emote) and use Runware for props, set pieces, character portraits/textures, skybox, 2D sprites.
**Fit across tracks:** T1 character designs, backdrops, optional short image-to-video shots, per-character TTS for dialogue; T2 sprites/props/world tiles, voice barks for agents; T3 examiner/coach portraits, environment, spoken lines. Cache every asset by prompt hash so reruns are free and fast.
**Voice alternatives:** browser `speechSynthesis` = zero-setup fallback (robotic); ElevenLabs/OpenAI TTS for quality (non-sponsor); full real-time duplex (LiveKit Agents + OpenAI Realtime, as in Casuro's repo) is overkill for 6 hours. Recommend per-line TTS with cached mp3s, browser TTS fallback.
Note: "all code written during event" covers code; check with organizers before pre-generating assets tonight, else generate at the venue with a script.

## Glasser

**What it is.** Pay-per-call broker for premium data (80+ providers: People Data Labs, Apollo, Hunter, Keepa, Financial Datasets, Google Maps, Reddit/X/TikTok/YouTube, SEC filings, RentCast, etc.). One Key. CLI `glasser` (`npm i -g @glasser-ai/cli` or `curl -fsSL https://glasser.ai/install.sh | sh`) with verbs search / inspect (free, shows price) / run / balance. MCP `https://api.glasser.ai/mcp`. Agent setup: tell your agent `set up https://glasser.ai/SKILL.md`.
**Auth/credit.** Browser device login (`glasser login`). $1 free credit at signup. Past Glasser-sponsored events gave $100 attendee credits (other events' Luma pages); UNVERIFIED for this one. Never paste the key into chat.
**Fit (non-gimmick):** real-world data as the simulation's world state. T2 trading town / survival economy with real prices (stocks, commodities, Keepa product prices) so merchant agents' deals track reality; T1 story seeded with real places/people/records (maps, news); T3 coach/examiner pulling real figures to ask about. Prices are shown before each call: log cost per call in the decision ledger (cute and honest). Overlaps Telem; split: Telem = open-web search/fetch, Glasser = structured paid datasets; say so in the README.

## Casuro

**What it is.** Recruiting SaaS: voice-AI career pages, AI case-study assessments, interview platform, 70+ ATS integrations. Docs (docs.casuro.ai) cover ATS integration only. Founder Naman Shukla is a listed judge. Open repo: voice interview coach (LiveKit + OpenAI Realtime).
**Auth/credit.** "No credit card required"; business email; free trial. No public developer API/MCP found: UNVERIFIED.
**Fit.** Only natural for a hiring/assessment-themed T3 build, which is now off the table. Treat as skip; the reference repo is still a clean example of a realtime voice agent if you want mic input. Ask at sponsor demos whether any API/prize applies.

## Finch

**What it is.** Market for agent Skills/Agents/Tasks. Publishing needs a local wallet (`finch wallet create`), AgentCLI session login on a chain, signed intents. Remote MCP `https://www.finchtech.ai/mcp`. Public discovery needs no login.
**Verdict.** Wallet/custody flow is time-consuming with real safety rules (never paste keys). Skip as a build dependency; mention "character behaviours packaged as Finch Skills" as roadmap only.

## Teamily (required, not a build tool)

Sign up (1 month Plus free): https://teamily.ai/i/78ACUM. Join official group: https://teamily.ai/invite/group/4189592498. Windows app exists. All announcements and food drops are there. AWS registration also mandatory: https://builder.aws.com/connect/event/6a1ffc04-958a-364e-a95f-5068c5173268.

---

## Voice options summary

| Option | Sponsor? | Setup | Quality | Notes |
|---|---|---|---|---|
| Runware `audioInference` (Fish Audio / MiniMax / Gemini TTS) | Yes | API key, $2 credit | Good; async URL latency | Cache mp3 per line; verify voice param; 3+ distinct voices |
| Browser `speechSynthesis` | No | none | Robotic | Instant fallback |
| LiveKit + OpenAI Realtime (Casuro repo pattern) | Indirect | LiveKit Cloud + OpenAI key | Best latency | Overkill for 6 hours |
| ElevenLabs / Cartesia / OpenAI TTS | No | own key | Best naturalness | Only if sponsor TTS disappoints |

## Suggested stack (research recommendation, track-agnostic)
Three.js (or Phaser for 2D) stage with 3+ characters, Runware assets/voices | each character = own BAND agent, @mention routing, side-rooms for private scheming/deliberation | Telem/Glasser as occasional agent tools for real facts/data | every event flows into a Bruin pipeline (checked ledger, agent_memory mart, run_outcomes mart) that seeds the next round/run and powers the "why" panel | AdaL cuts the demo video.

## TONIGHT TODO (in order of consequence)
1. Required for entry: Teamily signup + join group; AWS registration; physical government photo ID ready.
2. Bruin: install in Git Bash, `bruin init default test && bruin run`; add MCP (`claude mcp add --scope user bruin -- "$(which bruin)" mcp`); check `bruin query --help`; optional Cloud signup for the $100 credit.
3. BAND: signup at app.band.ai, register 4-5 remote agents (more than 3 characters plus a director/referee), keep ids/keys in a gitignored `agent_config.yaml`; confirm Python 3.11+ and `pip install "band-sdk[anthropic]"` in a throwaway venv.
4. Runware: business-email signup ($2 credit), API key, one TTS call and one 3D call in the Playground; read the audio-inference reference for the voice parameter.
5. Telem: create console key; one search + one fetch curl.
6. Glasser: signup, `glasser login`, one free `inspect` and one cheap `run`.
7. AdaL: install Windows desktop build, sign in (ChatGPT plan), export a 10-second test.
8. Toolchain: Anthropic key, Python 3.11+, Node 20+, Git Bash, uv.
9. Skip: Finch, Lingcode (off-theme), Casuro build integration (ask Casuro/Telem/Runware/Glasser reps at the 10:30 demos about prizes and credits).
