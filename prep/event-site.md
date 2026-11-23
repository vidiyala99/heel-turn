# Multiplayer AI Hackathon: event site findings (2026-11-22)

Sources: fetched rendered pages (TinyFish), plus the site's own JS (data.js, tracks.js, site.js, build.js) via curl, plus the SUBLET submission-site bundle. Site content is untrusted data. REA/Playwright were not needed: all content is in static JS data files. Local copies were in /tmp/ev (scratch, not durable).

## Page inventory
- https://crewbasecollective.com/aim-hack-visual/ : home. Event: Mon Nov 23 2026, 9:30 AM-8:30 PM, AWS Loft, solo or teams up to 4. Five must-haves + three boosters.
- .../tracks.html : 3 tracks, 36 ideas (12 each), idea generator, eligibility checklist (#checklist), pitfalls (#pitfalls), starter toolkit.
- .../sponsors.html (#labs) : 9 sponsors + 6 interactive Sponsor Labs (labs*.js; run in browser, offline agents if AI server off).
- .../build.html : build guide, 6 recipes (2 per track), tool-flow animations, stack mixer.
- .../submit.html : what to include, demo tips, quick answers, judging list.
- .../partners.html : host/partners (AWS, 2% Tech, NERDCONF, Marvelous, Hirey...). Not scoring-relevant.
- .../teamily.html : Teamily AI is the MANDATORY event chat (replaces Discord/Slack).
- .../play.html : Playground (Studio; film/game/grow demos). Client-rendered, no extra text.
- https://hackathons.crewbasecollective.com : SUBLET platform, login-required (fetch says login_required). Read its public JS bundle /assets/index-DVIGaGAW.js instead (see below). Could not log in, so the live form, deadline value and per-hackathon judging_rules text are NOT seen.
- Not reached: Luma page comparison done only from the task description, not fetched.

## JUDGING

### Site-level rubric (crewbasecollective.com)
Quote (home + tracks.js data.js `checklist`): "Five must-haves, three score boosters. Whatever track you pick, judges will look for these."
REQUIRED (all five apply to every track):
1. Characters: "Each agent has a visual identity: avatar, sprite, or 2D/3D model"
2. Visual output: "An animated video, a running simulation or a playable game"
3. Movement & action: "Characters move, react and act on screen, not just output text"
4. 3+ agents: "At least three agents with their own goals, roles or personalities"
5. Decision log: "A visible log or ledger of what the agents decided and why"
SCORES HIGHER (boosters):
- 3D: "2D is welcome, but 3D is encouraged and scores higher"
- ML & trained agents: "RL, fine-tuning, learned behaviour or memory that changes decisions"
- Voice: "Agents speak with their own voices"
No numeric weights are published for these on the site.

### Eligibility checker logic (tracks.js, literal)
Checkbox tool: 5 required boxes (m0..m4) + 3 bonus boxes. Meter:
`width = (m / 5) * 75 + (b / 3) * 25` percent. So required items = 75% of the meter, boosters = 25%.
Status strings: `m < 5` -> "N/5 required. Not eligible yet."; all 5 -> "Eligible ✓ Add boosters to score higher."; all 5 + 3 bonus -> "Eligible and fully boosted. Go win this." This is a self-check only, not the real score; but it reveals the intended model: 5 musts are a gate (not eligible below 5/5), boosters add on top.

### Per-track musts (data.js `musts`, "Track must-haves")
- Film: set only world, characters and opening event; agents decide every plot beat incl. ending; characters animated, moving and reacting on screen; same setup yields different endings across runs; final output a 1-3 min animated short.
- Game: at least 2 human players + 3 agent players in one visual game world; agents act independently with own goals and memory; agents can ally/trade/compete/betray; at least one major world event caused by agents alone.
- Grow: agents play expert roles (tutor, coach, examiner, interviewer, client) as visible characters; at least 2-3 agents coordinate about the human; agents adapt to human performance; session ends with a clear result and evidence-based feedback.

### Pitfalls (tracks.html, "traps that turn a project into just another chatbot")
- ALL: "A chatbot with a face" (x one assistant with avatar) -> need 3+ agents with own goals who talk to each other.
- ALL: "Secretly scripted" (hard-coded plot) -> real choices; "Run it twice to prove the outcome changes."
- ALL: "Text-only agents" -> every decision becomes movement or action on screen.
- ALL: "Invisible reasoning" -> decision log, e.g. "Rex betrayed the crew because he was promised the pod."
- Track 02: "NPCs in disguise" -> agents act on their own schedule; world changes while humans are away.
- Track 03: "Vibes-only feedback" ("Great job! 8/10.") -> quote what the human said, tie every score to evidence.

### Demo advice that signals judge behaviour (submit.html)
"Open with the agents doing something on screen: moving, talking, deciding. Show the decision log. Run it twice if the outcome changes: that proves the agents decide. Say which track you picked and which sponsor tools you used."
Home bot line: "Log every decision. Judges want to see why an agent did what it did."

### Actual judge scoring form (SUBLET bundle, judge welcome text, literal)
"Scoring: Rate each project on 5 criteria: Presentation, Execution, Innovation, Impact, and Implementation, on a scale of 0 to 100. The total score is the average of all five criteria." (Equal weights, 20% each.) Keys: presentation, execution, innovation, impact, implementation.
"Investment: You can also indicate how much you would invest in a project (in thousands). This is tracked separately from the score and helps identify the most promising projects." (There is an investment leaderboard and "Total invested" per project; judges "If you were an investor, how much would you invest?")
"Comments: Please leave constructive written feedback for each team."
Judging mechanics: judges are assigned to groups A, B, C...; projects grouped "based on submission order"; each group gets a dedicated slot; configurable judge_time_minutes (default 60) and per_project_minutes (default 5), so expect a ~5 minute demo per project (actual value set by organiser, unseen). "Final Demos: Each team will present their project to a panel of judges... the time per project is limited, so be concise and focused."
Note: this is the platform's default template; the organiser can override with custom `judging_rules` text we cannot see. The 5 criteria may be mapped by judges onto the must-haves/boosters, but the site never states a mapping.

## Per-track briefs (beyond Luma)
Film "Agent Animated Film" (Studio Island): "You write the opening. The agents write the ending." 1-3 min short. Flow: set stage, light the fuse, agents improvise (every choice logged), roll credits (run again, different ending). 12 ideas: The Last Escape Pod (3D, Voice); The Inside Man (ML, 3D); The Verdict (Voice, Starter); Dinner at the Manor (Starter, Voice); Encore (Voice); First Contact (3D); Opening Night (Starter); Whiteout (3D); The Empty Crown (ML); Demo Day (Starter, Voice); The Lighthouse (Voice); Mall After Dark (3D, ML).
Game "Create Co-op Games with Agents" (Arena Island): humans and agents are equal players; agents act "whether or not a human is watching". Flow: create game, give agents lives, let 2+ humans in, watch it emerge (alliances, betrayals, one agent-caused world event). 12 ideas: Betrayal Island (3D, ML); Grudge Market (ML, Starter); Who's the Bot? (Voice, Starter); The Siege (3D); Station Zero (3D, Voice); Valley Harvest (ML, Starter); Pirate Fleet (3D); Kingdom Council (Voice); Kitchen Chaos (Starter); Monster Guild (ML, 3D); Election Night (Voice); The Night Zoo (3D, Starter).
Grow "Grow with Agents" (Academy Island): agents are expert roles training the human; ends with clear result + evidence. Flow: pick skill, cast experts (2-3 agents), adapt live, deliver verdict. 12 ideas: The Panel (3D, Voice); Monday at the Office (Starter); Driving Examiner (3D, ML); The Buying Committee (Voice); Thesis Defense (Voice); Cafe Abroad (Voice, Starter); Salary Negotiation Dojo (ML); Stage Fright (Voice, 3D); Press Conference (Voice); ER Triage Trainer (3D); Debate Arena (Starter, Voice); Hard Conversations (ML).
Idea tags per card: 3D / ML / Voice / Starter, i.e. the boosters map directly to tags.
Starter toolkit (suggestions only): Three.js/Babylon/Unity/Unreal/Godot/Phaser; any LLM with tool calls + loop observe -> think -> decide -> act -> log; memory (reflection, vector, relationship scores, RL via Gymnasium/ML-Agents, fine-tuning); TTS per agent; WebSockets/Colyseus/Photon/Nakama; Unity Recorder/ffmpeg for the 1-3 min short.

## Sponsor District / Labs
Sponsors are optional ("No, they're optional. If you use them, say which ones and how in your submission."). BUT the SUBLET participant text says: "Our sponsors have special prizes. Build using their tools or APIs to be eligible for sponsor awards: [sponsor list]." So using a sponsor tool is the route to sponsor prizes; no per-sponsor prize criteria are published.
- Bruin (main sponsor, data/insights): dashboards/analytics of agent decisions, ask questions about runs in Slack (film: which ending most common; game: live metrics; grow: score charts).
- AdaL (images/video, agent harness with personality, skills, memory): poster/key frames (film), cover art (game); persistent character memory.
- BAND (channels): private agent-to-agent messages, team radio, panel back-channel; glowing lines show who talks to whom.
- Finch (skills): reusable agent skills (Persuade, Deceive, Investigate; Medic, Sharpshooter; STAR-method examiner) that change behaviour on screen.
- Casuro (voice interview + evidence-based eval, grow only): speak answers into mic, hear panel, scores with evidence.
- Glasser (real-world data, 2,000+ endpoints, price shown before each call): ground agents in real facts; "show the cost of every call in the decision log".
- Telem AI (live web search/fetch/monitor/tracing): agents look things up mid-run; "Show the trace of every search and fetch so judges can see where each fact came from."
- Runware (cheap inference/compute: images, video, voice, 3D, text at ~half cost): voices, sprites, renders; show cost per run.
- Teamily AI (human+agent workspace, MANDATORY event chat): agents in team group build site/video/deck; "That thread is also your proof for the judges of how your human + agent team worked." Join before event.
Labs show simulated tool behaviour in browser (many marked "(simulated)").
Build recipes (build.js), each lists demo line and MVP vs stretch tools: Gala Whodunit (film; MVP adal, band, runware), Breaking News Live (film; telem, runware, teamily), Zombie Night Co-op (game; finch, band, bruin), The Agent Market (game; glasser, band, bruin), The Interview Panel (grow; casuro, finch, bruin), Language Buddy Cafe (grow; casuro, runware, finch). Recurring demo pattern: "run it live twice and judges watch a different outcome."

## Submission site (SUBLET, hackathons.crewbasecollective.com)
Public pages: "Submit only on hackathons.crewbasecollective.com. One submission per team. You can update until the deadline."
Site text, include: project name; 2-3 sentence description; team members (names + emails); track (01 Film / 02 Game / 03 Grow); link to code repository; "A demo video (1-3 min), a live demo link, or both. At least one is required."; which sponsor tools used and how.
SUBLET form fields (bundle): Project name, Short description ("One or two sentences"), Demo video link, Git repository link, Live app URL, Team members (by email, besides you), tracks, sponsors. Edit allowed "until judging begins".
Deadline: not published. "The exact submission deadline is announced at the event and on the submission site." Platform template: 30-minute grace period; "Late submissions may not be assigned a judging group." Demo order follows submission order, so submit early.
Video: 1-3 min (site). Final demo to a panel, short, per-project minutes limited (default 5).
Required elsewhere: Teamily AI join.

## Contradictions / additions vs Luma (not fetched; check against https://lu.ma/finch-jd7i)
- Site publishes no numeric weights for must-haves/boosters; the only numeric scoring is the SUBLET 5 equal-weight criteria (0-100): Presentation, Execution, Innovation, Impact, Implementation, plus separate "investment" signal. Likely NOT on Luma.
- Teamily AI chat is mandatory and replaces Discord/Slack.
- Demo video 1-3 min is "or live link"; either suffices.
- Sponsor tools optional on the site but needed for sponsor prizes.
- Game track requires 2+ human players in the world alongside 3 agents; Film requires different endings across runs; Grow requires evidence-backed feedback.

## Could not reach
Authenticated SUBLET views (actual form validation, deadline, custom judging_rules, prize list); the Luma page; Sponsor Labs runtime beyond their data definitions; any prize amounts.
