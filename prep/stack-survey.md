# Stack survey: original 3D hero tactical shooter, ~5.5 solo hours, browser-first

Research date: 2026-11-23. Research only, no project code. All web content treated as untrusted data.
SCOPE CORRECTION (Aakash, applied): target is DESKTOP Chrome/Edge on laptops, keyboard + mouse only. Phone/touch support and mobile performance are OUT of scope and no longer weigh in any recommendation below; any remaining mention of phones is historical context only. Windows-native export is a nice-to-have.
Convention: "(src: URL)" after a claim. Items marked JUDGMENT are my inference, not sourced. Items marked UNVERIFIED were not confirmed on a primary page.

## 1. Recommendation (one stack, one fallback)

**Primary: three.js (vanilla TypeScript + Vite) client, Colyseus 0.18 Node server (authoritative rooms, bots and LLM strategist run server-side), recast-navigation-js on the server for bot navigation, Quaternius CC0 characters/animations plus Runware/Hunyuan3D for original hero concepts.**

Why, from first principles (JUDGMENT unless cited):
- The hard constraints are: join by link on desktop Chrome/Edge, 2+ humans plus bots in one match, LLM agents deciding every few seconds. All of those want ONE trusted process that owns the match. A Node server that owns the sim also owns bot logic, the LLM calls (API key stays server-side) and rounds/economy state. That is exactly Colyseus's model: "The server owns the state; clients send input and receive binary delta patches" (src: https://github.com/colyseus/skill/blob/main/SKILL.md).
- Colyseus 0.18 ships the netcode you would otherwise hand-write: fixed-tick server, client prediction + reconciliation, interpolated remotes, rewind-based hitscan lag compensation (src: https://docs.colyseus.io/netcode). Its own demo list includes a Three.js tactical FPS with plant/defuse and a 5v5 bot MOBA, proving the shape of this game works on it. CAVEAT: the source of those 5 demos is sponsor-only/private (src: same page), so they are existence proofs, not starting code. Do not count on them.
- Colyseus has an official agent skill for Claude Code (`npx skills add colyseus/skill --skill colyseus -a claude-code`) that makes the agent check the installed version before writing Room/Schema code (src: https://claudecode.directory/skills/colyseus/skill/colyseus, https://docs.colyseus.io/getting-started). That directly cuts the main AI-assisted-dev risk (hallucinated old APIs).
- three.js gives the fastest time-to-polished-3D with an AI coding agent: biggest corpus, glTF-native, and an angled top-down camera is a camera position and lookAt, not a feature. Several three.js agent skills and an MCP exist (section 5).
- Browser beats native for "anyone joins by link" on desktop Chrome/Edge (section 9). Desktop-only also removes touch controls, mobile perf budgets and the iOS speech gap.

**Fallback: Playroom Kit + React Three Fiber (R3F), host-authoritative.** No backend to write; rooms, shared state and player join/quit are built in (its virtual Joystick is touch-oriented and irrelevant now; use keyboard/mouse). Its official tutorial is literally a multiplayer 3D shooter with an angled top-down camera, kills/deaths and respawn (src: https://docs.joinplayroom.com/examples/multiplayer-shooter-game). Tradeoffs: the host client is the authority (bots, damage and the LLM calls would run in the host's browser, API key exposure and host-leaves problems; JUDGMENT), and the tutorial's hit logic is physics-bullet-on-host, not tactical-shooter grade. Pick this if by hour ~1.5 Colyseus rooms plus bots are not both working. Playroom pricing is not listed on public pages (src: https://caisual.com/blog/godot-web-export-multiplayer, table row) so check it before relying on it.

## 2. Setup commands (primary stack)

JUDGMENT on exact flags; package names are from sources cited.

```bash
# project
npm create vite@latest hero-shooter -- --template vanilla-ts && cd hero-shooter
npm i three
# netcode: server + client (Colyseus 0.18 required for room.input()/Predict/allowRewindState)
npm i colyseus @colyseus/schema colyseus.js     # confirm exact package names with the skill below
# navmesh + crowd, three.js helpers (MIT)
npm i recast-navigation @recast-navigation/three
# optional steering/goal-driven AI helpers (MIT)
npm i yuka
# agent skills / MCP
npx skills add colyseus/skill --skill colyseus -a claude-code
# (three.js skill options in section 5)
```
- recast-navigation: `await init()` before use; with Vite, add `optimizeDeps: { exclude: ['recast-navigation'] }`; works in Node and browser; MIT (src: https://github.com/isaac-mason/recast-navigation-js).
- Colyseus is MIT, "free forever, even for commercial games" (src: https://colyseus.io/ and https://github.com/colyseus/colyseus).
- Hosting the Node server for other players' laptops needs public HTTPS/WSS (mic needs a secure context too; src: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html for the secure-context rule on mic, applies to all browsers). JUDGMENT: pre-pick the host tonight (Fly.io/Render/Railway or a tunnel) and deploy a hello-world room before the event; Colyseus Cloud and Edgegap are listed as managed options (src: https://docs.colyseus.io, https://edgegap.com/integration/colyseus).

## 3. Engines and frameworks

| Engine | Time to polished 3D | Web export quality | Multiplayer story | AI-assisted dev (Claude Code) fit | License |
|---|---|---|---|---|---|
| three.js (+ vanilla TS) | Fast; you assemble lighting/post/camera yourself but huge example corpus (JUDGMENT) | Native web; runs on phones; no export step | Pair with Colyseus/Socket.IO/Playroom; many open FPS references (sec. 7) | Best: text-only project, hot reload, skills + MCP exist (sec. 5) | MIT (UNVERIFIED on a fetched page; well known) |
| react-three-fiber (R3F) + drei + rapier | Fastest for demo-grade scenes; Playroom's shooter tutorial is built on it (src: https://docs.joinplayroom.com/examples/multiplayer-shooter-game) | Native web | Playroom Kit has first-class R3F hooks (src: https://docs.joinplayroom.com/frameworks/web/r3f) | Very good; React state vs a 60Hz authoritative sim can get awkward (JUDGMENT) | MIT (UNVERIFIED) |
| Babylon.js | Fast; batteries included (physics, GUI, inspector) | Native web, WebGPU/WebGL | Bring your own (Colyseus has Babylon-friendly SDK use; UNVERIFIED) | Good; smaller corpus than three.js (JUDGMENT) | Apache 2.0 (UNVERIFIED); Havok physics plugin MIT (src: https://doc.babylonjs.com/features/featuresDeepDive/physics/havokPlugin) |
| PlayCanvas | Fast with its visual web editor; engine is code-first too | Native web, WebGPU or WebGL2, desktop and mobile (src: https://developer.playcanvas.com/user-manual/engine) | Bring your own; recast-navigation has a PlayCanvas package (src: https://github.com/isaac-mason/recast-navigation-js) | Editor is GUI-centric, worse for agent loops (JUDGMENT); engine-only is fine | Engine MIT (src: https://github.com/playcanvas/engine) |
| Godot 4 | Fast for 3D scenes and animation retargeting; art direction work is GUI-heavy | Web export works but: WebGL2 Compatibility renderer only, no WebGPU, no C# on web, tab pauses when backgrounded, low-level networking absent (HTTP, WebSocket client, WebRTC only), mic needs secure context, audio effects missing in default mode (src: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html). Single-thread export is default since 4.3 and works on iOS/macOS (same page) | High-level multiplayer exists but web can only be a WebSocket/WebRTC client; authority must be a server (src: https://caisual.com/blog/godot-web-export-multiplayer). Colyseus ships a Godot SDK/ports (src: https://docs.colyseus.io/netcode) | Godot MCPs exist (sec. 5) but scene/editor workflow is less agent-native than code-only (JUDGMENT) | MIT (UNVERIFIED on fetched page) |
| Unity WebGL | Slow to bootstrap in 5.5h; excellent tooling | Unity 6 web runtime lists iOS Safari 15+ and Chrome 58+ Android as supported mobile browsers (src: https://docs.unity3d.com/6000.6/Documentation/Manual/webgl-browsercompatibility.html), but older docs warn mobile WebGL is poorly suited and memory-limited (src: https://docs.unity3d.com/530/Documentation/Manual/webgl-browsercompatibility.html). WebGPU out of experimental in 6.6 but off by default (src: https://app.cinevva.com/news/2026-09-01-unity-6-6-webgpu-production) | Netcode/Photon/Colyseus Unity SDK; browser transport limited to WebSocket/WebRTC (JUDGMENT) | Unity MCPs exist; heavy editor and large builds slow iteration (JUDGMENT) | Unity Personal/Pro EULA (UNVERIFIED; not checked) |

Verdict: three.js primary. R3F is the fast path only if you go Playroom. Godot and Unity are not worth the web-export and editor-loop risk in 5.5 hours for a phone-join requirement.

## 4. Browser multiplayer netcode

| Option | What it is | 2 browsers + server-authoritative bots, fastest? | Notes / source |
|---|---|---|---|
| **Colyseus 0.18** | Authoritative Node rooms, schema delta sync, matchmaking, built-in prediction/reconciliation/lag-comp | YES (primary): bots are just server entities in the same Room tick | MIT. Netcode: https://docs.colyseus.io/netcode . Agent skill: https://github.com/colyseus/skill |
| Socket.IO | WebSocket/long-polling messaging | Workable but you write rooms, tick loop, state diffing, prediction yourself | Open three.js+Socket.IO FPS repos exist as reference (sec. 7); Socket.IO docs not fetched (UNVERIFIED) |
| Geckos.io | UDP-like channel over WebRTC DataChannel + Node server | Not fastest: only a transport, needs your own netcode; WebRTC adds ICE/TURN setup risk (JUDGMENT) | https://github.com/geckosio/geckos.io . Worth it only if TCP head-of-line blocking is proven to hurt; it will not in a 5.5h demo (JUDGMENT) |
| PartyKit / PartyServer | Cloudflare Durable Objects rooms over WebSockets; Party.Server API | Good for a thin room server, but the Durable Object runtime is not a full Node env: WASM navmesh + LLM loop is riskier (JUDGMENT) | https://docs.partykit.io/how-partykit-works , https://npmjs.com/package/partyserver |
| **Playroom Kit** | Hosted rooms, shared state (`setState`), `isHost()`, Joystick, R3F/three.js hooks, no backend | YES (fallback): fastest to "2 browsers", but host-authoritative, not server-authoritative | https://docs.joinplayroom.com/ , three.js: https://docs.joinplayroom.com/frameworks/games/threejs |
| Nakama | Open-source server with matchmaking, social; Godot/Unity clients | Overkill; server logic in Go/Lua/TS modules, more setup (JUDGMENT) | Pricing/hosting via Heroic Cloud (src: https://caisual.com/blog/godot-web-export-multiplayer) |
| Godot high-level multiplayer | ENet normally, WebSocket/WebRTC on web | Web client cannot host; needs external authority | https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html |

Colyseus 0.18 primitives mapping to this game (src: https://docs.colyseus.io/netcode): own movement = `predict.reconciler`; remote players = `Predict` lerp; hitscan = `allowRewindState` + `rewind.lastSeenBy`; discrete events (kills, plant) = `predict.defineEvent`.

## 5. Bots: pathfinding, steering, aim/shoot

| Piece | Choice | Why / source | License |
|---|---|---|---|
| Navmesh + crowd | **recast-navigation-js** (WASM, Recast/Detour): navmesh from glTF geometry, `computePath`, Crowd agents with `requestMoveTarget`, `requestMoveVelocity`, off-mesh links, temporary obstacles (TileCache), import/export navmesh as Uint8Array, runs in Node and browser, `@recast-navigation/three` helpers (`NavMeshHelper`, `CrowdHelper`) | https://github.com/isaac-mason/recast-navigation-js . Same author notes `navcat`, pure-JS alternative using the same algorithms (same page) | MIT |
| Lighter alternative | three-pathfinding (navmesh path queries, multiple zones, no crowd/avoidance) | https://github.com/donmccurdy/three-pathfinding . Use if WASM init in the server proves painful | MIT (UNVERIFIED) |
| Steering / goals / fuzzy | **Yuka**: Vehicle + steering behaviors, goal-driven agent design, fuzzy logic (weapon selection/aggression), triggers, vision, built-in navmesh. Showcase is a deathmatch shooter in pure JS | https://github.com/Mugen87/yuka , https://mugen87.github.io/yuka/showcases , https://discourse.threejs.org/t/game-ai-how-to-implement-a-basic-deathmatch-shooter/7609 | MIT (UNVERIFIED) |
| Aim/shoot | Hand-rolled in the server tick (JUDGMENT): state machine per bot (hold angle, peek, advance, plant, retake); aim = turn-rate-limited rotation toward target + reaction delay + inaccuracy cone; LOS by raycast against map colliders; fire via the same hitscan code path humans use. A bot is "a human whose input comes from code" so lag-comp and damage need no special case |

Division of labour (JUDGMENT, matches the brief): fast scripted layer (every tick, 20-60Hz) owns move/aim/shoot; LLM layer (every 3-5 s plus between rounds) only emits structured intents per bot, e.g. `{bot, role:"hold", site:"A", angle:"long", use_ability:"smoke_at_choke"}`, which the scripted layer executes. Always keep a rules-only fallback when the LLM call is late or malformed.

## 6. Assets

License column is exact where I could verify a primary page.

| Source | What | License (exact) | Source URL | Notes |
|---|---|---|---|---|
| Quaternius Toon Shooter Game Kit | 70+ models: toon characters with 17 animations, enemies, environment, weapons; FBX/OBJ/glTF/Blend | CC0 | https://quaternius.com/packs/toonshootergamekit.html , CC0 catalog entry https://tmhsdigital.github.io/Free-Game-Dev-Assets/entry/quaternius-toon-shooter-game-kit | Best single fit for a shooter look. Playroom's tutorial character (weapons AK, SMG, Sniper, etc., animations Idle/Run/Run_Shoot/Death) matches this style (src: https://docs.joinplayroom.com/examples/multiplayer-shooter-game); whether it is this exact pack is UNVERIFIED |
| Quaternius Universal Animation Library (1 and 2) | Humanoid rig, retargetable locomotion and more | CC0; "free to use in personal, educational and commercial projects" | https://quaternius.com/packs/universalanimationlibrary.html , https://quaternius.com/packs/universalanimationlibrary2.html | Free version is the standard pack; "60-70% of my pack is completely free" (same page). Verify it contains rifle-aim/shoot clips before depending on it |
| Quaternius Universal Base Characters, Modular Character Outfits, Fantasy/Sci-Fi kits | Modular bodies/outfits compatible with the UAL rig | CC0 | https://quaternius.com/packs/universalbasecharacters.html , https://quaternius.com | Good base for 4-6 "original" heroes via outfit/colour/prop swaps (JUDGMENT) |
| Quaternius other (Sci-Fi Essentials guns/enemies, Modular Sci-Fi Megakit, Cyberpunk Game Kit, Downtown City MegaKit) | Weapons, modular map pieces | CC0 | https://quaternius.com | Site states the library uses the CC0 License |
| Kenney | Huge 2D/3D sets (incl. 3D glTF) | CC0, "personal, educational and commercial", credit appreciated not required | https://github.com/pipecat-ai/pipecat-godot-demo/blob/main/assets/kenney/License.txt (copy of Kenney's license text) | Map blocks and props |
| KayKit (Kay Lousberg) | Character packs (Adventurers, Skeletons), animations, environment | CC0 "Licensed for personal and commercial use, no attribution required"; do not resell unmodified copies | https://kaylousberg.itch.io/kaykit-series-6 , https://kaylousberg.itch.io/kaykit-character-animations | Note CC0 text on the itch page plus a "don't resell unmodified copies" request |
| Poly Pizza | Aggregator of low-poly models | MIXED: per-asset licences, many CC-BY (not CC0); only Quaternius/Kenney items on it are CC0 | https://poly.pizza/ , https://poly.pizza/m/DgOCW9ZCRJ (Quaternius model page says Public Domain CC0), per-asset attribution list example https://poly.pizza/l/LcN6ZNOfFm/credits | Check the licence line on every model; a third-party summary calls it CONDITIONAL and "never for a hero asset" (https://github.com/libcnalab/house-simulator/blob/develop/docs/licence-evidence/quaternius-kenney-polypizza.md) |
| Mixamo (Adobe) | Auto-rigger + animation library, bipedal humanoids only; free with an Adobe ID | "You can use both characters and animations royalty free for personal, commercial, and non-profit projects including... video games" (FAQ dated Sep 14, 2021). Not available for Enterprise/Federated IDs or China country code | https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html | Use it to rig/animate your AI-generated hero meshes. Do not ship the raw Mixamo files as a standalone downloadable pack (community reading, weak source: https://community.adobe.com/questions-696/mixamo-and-commercial-use-589289). Requires neutral-pose, clean, humanoid mesh (FAQ) |
| Meshy (AI text/image-to-3D, rigging, animation) | Original hero meshes | Free plan: CC BY 4.0, commercial use allowed WITH attribution to Meshy, 100 credits/month, Meshy-6-Lite downloads limited (about 10/month per a third-party summary). Paid plans: private, customer-owned, no attribution | https://docs.meshy.ai/en/webapp/pricing , https://help.meshy.ai/en/articles/15696428-what-is-included-on-the-free-plan , https://ai.codigital.co.jp/en/guides/meshy-guide | If using the free tier put "Models by Meshy (CC BY 4.0)" in a credits screen |
| Tripo (AI 3D) | Text/image-to-3D, rigging | Free plan: 300 credits/month, outputs do NOT support commercial use and require attribution/IP belongs to Tripo; paid plans include commercial rights. API: 1 credit = $0.01 | https://tripo3d.ai/product-doc/getting-started/pricing-credits , https://tripo3d.ai/game-development/fast-text-to-3d-ai-generators-for-game-pipelines , https://developers.tripo3d.ai/en/pricing | Treat free tier as prototype-only |
| Runware (Hunyuan3D 3.1 Pro / Rapid text-to-3D via one API; CLI `runware run tencent:hunyuan-3d@3.1-pro positivePrompt="..."`) | Original hero meshes with PBR, text or image input | Output licence UNVERIFIED: check Runware terms and Tencent Hunyuan3D licence before shipping generated meshes | https://runware.ai/docs/models , https://github.com/Runware/runware-cli , https://runware.ai/docs/models/tencent-hunyuan-3d-3-1-rapid/examples | Your brief lists Runware; the exact model terms were not verified here |

Fast path to "original heroes" (JUDGMENT): generate hero concept art (Runware image) -> Hunyuan3D/Meshy/Tripo mesh -> Mixamo auto-rig + animations (or retarget UAL) -> glTF. This has high failure risk at 6 heroes in 5.5h. Lower-risk path: 4 heroes built from Quaternius Universal Base Characters + outfit/colour/prop swaps + one AI-generated hero as a stretch, since originality can live in names, abilities, voices and silhouettes. Event rule check (all code during the event; assets and libraries fine) is satisfied by either; confirm that rule wording about generated assets with the organisers (JUDGMENT).

## 7. Reference examples (read for patterns, do not fork a finished game)

| Reference | What it shows | Source | Licence |
|---|---|---|---|
| Colyseus premium demos: ColyStrike (tactical FPS, plant/defuse), MOBA (5v5 bots), Air Hockey, Karts | Existence proof of the exact architecture | https://docs.colyseus.io/netcode | Source is sponsor-only/private; treat as unavailable |
| Colyseus "Three.js Examples" index (Mazmorra dungeon crawler) | Open examples list | https://docs.colyseus.io/learn/examples/threejs | UNVERIFIED |
| Colyseus tanks demo (fully authoritative, spatial clustering) | Server-authoritative movement, shooting, damage, pickups | https://colyseus.io/blog/new-demos-realtime-tanks-turnbased-cards | UNVERIFIED |
| Playroom Kit multiplayer shooter tutorial | Angled top-down camera, joystick, bullets, kills/deaths, respawn, R3F + Rapier | https://docs.joinplayroom.com/examples/multiplayer-shooter-game | Tutorial snippets; Playroom ToS UNVERIFIED |
| LukeTsengTW/threejs-multiplayer-fps | three.js + Socket.IO + Vite, server-authoritative Node | https://github.com/LukeTsengTW/threejs-multiplayer-fps/blob/main/README.md | Check repo LICENSE (snippet says "Original project source code is licensed...", rest not seen) |
| felixgren/three-arena | three.js + Socket.IO FPS, octree collisions | https://github.com/felixgren/three-arena | UNVERIFIED |
| DotanVG/Orbital-Breach | three.js + WebSocket, has bots and solo authority modules | https://github.com/DotanVG/Orbital-Breach | UNVERIFIED |
| ai-2070/net-fps | P2P host-authoritative FPS with prediction and lag comp over WebRTC | https://github.com/ai-2070/net-fps | UNVERIFIED |
| jobendik/WarZone | Browser FPS with Yuka goal-driven bot AI and fuzzy aggression | https://github.com/jobendik/WarZone | UNVERIFIED |
| Reddit: server-authoritative FPS (R3F + Colyseus + Rapier WASM, server owns movement, combat, projectiles, objectives) | Same stack as recommended | https://reddit.com/r/threejs/comments/1vc0a4q/a_serverauthoritative_multiplayer_fps | n/a |
| Yuka deathmatch showcase | Bot AI patterns | https://mugen87.github.io/yuka/showcases | n/a |
| recast-navigation-js three examples | navmesh + crowd with three.js | https://github.com/isaac-mason/recast-navigation-js (examples dir) | MIT |

Rule note: using these to learn patterns is fine; do not copy a finished game's code into your repo.

## 8. Agent tooling, voice

| Tool | What | Source | Notes |
|---|---|---|---|
| Colyseus skill | Keeps agent on current Colyseus 0.18 APIs; Claude Code path `.claude/skills/colyseus` | https://github.com/colyseus/skill | MIT. Install this first |
| paprika3d | Three.js MCP server + Claude Code plugin: screenshot, play, test, profile pages the agent builds | https://github.com/keeno-corp/paprika3d | UNVERIFIED maturity; screenshot/playtest loop is the valuable part. You also already have Playwright MCP locally (JUDGMENT: use that if paprika3d setup eats time) |
| three.js skills | CloudAI-X/threejs-skills (https://github.com/cloudai-x/threejs-skills), emiliodominguez/threejs-skills (R3F/model inspect/optimize, https://github.com/emiliodominguez/threejs-skills), cesartevisual/threejs-skills (24 skills, https://github.com/cesartevisual/threejs-skills) | Pick ONE, not three (JUDGMENT) | Quality UNVERIFIED |
| Three.js Resources MCP | Read-only MCP with version-verified three.js guides | https://threejsresources.com/mcp | |
| Blender MCP | Control live Blender from an LLM, `execute_blender_code` with full bpy; MIT, ~34k stars | https://github.com/ahujasid/blender-mcp , https://mcp.so/servers/blender-mcp | Use for cleanup/retarget/export of generated heroes; it runs arbitrary Python in Blender, so only on your own files (security) |
| Godot MCP | Coding-Solo/godot-mcp (MIT, 14 tools: launch editor, run, debug output), GDAI MCP | https://github.com/Coding-Solo/godot-mcp , https://gdaimcp.com/docs/installation | Only relevant to the fallback-of-the-fallback engine path |
| Unity MCP | Several exist | https://respawnstack.com/guides/mcp-for-game-engines | Not evaluated |
| Awesome list | MCPs and skills for Blender, Unity, Godot, Unreal, three.js, 3D generation | https://github.com/zhuyansen/awesome-3d-skills | Third-party, security-graded by author |
| Edgegap MCP + skills | Deploy/manage Colyseus servers from an agent | https://edgegap.com/integration/colyseus | UNVERIFIED depth |

Voice (push-to-talk) :
- Browser Web Speech API SpeechRecognition: caniuse lists Safari on iOS as "Partial support" and Firefox as unsupported for core versions (src: https://caniuse.com/speech-recognition). With desktop Chrome/Edge as the only target (scope correction) this gap no longer matters; Chromium support is JUDGMENT from usual Web Speech behaviour (the fetched snippet did not show Chrome), so confirm with a 5-minute test. Needs HTTPS and a user gesture (push-to-talk key/button satisfies that). Chrome's recognition is cloud-backed, so expect network latency (JUDGMENT).
- Optional fallback only if Web Speech proves flaky (JUDGMENT): hold-to-record with MediaRecorder, upload the clip to your server, transcribe via an STT API.
- Runware TTS: one endpoint for speech, music and SFX, pay per generation (src: https://runware.ai/audio-generation-api). Example prices: HeyGen Voice 1.0 $0.00003 per character, Inworld TTS-1.5 Mini from about $0.025 per audio, Inworld Realtime TTS-2 about $0.0058 per sample shown (src: https://runware.ai/pricing , https://runware.ai/models/inworld-tts-1-5-mini , https://runware.ai/models/inworld-tts-2). A recent changelog entry mentions 30 prebuilt voices and two-speaker dialogue (src: https://runware.ai/docs/changelog). Give each hero a distinct voice; cache the line audio. Browser `speechSynthesis` as a zero-latency fallback (JUDGMENT).

## 9. Windows-native vs browser: honest call

Browser still wins, now on desktop Chrome/Edge only (phones dropped). Reasons:
1. "Join by link" means zero install for the other player; native Windows fails that by definition. Godot web remains constrained (WebGL2 Compatibility renderer only, no C#, tab-pause disconnects; src: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) and Unity WebGL is the heaviest path, so the code-only three.js loop is still the fastest for an agent (JUDGMENT). With phones out, a native Godot/Unity Windows build is more viable than before, but it still gives up link-join and slows the agent loop; keep it as a nice-to-have, not the plan.
2. An angled top-down tactical camera with stylised low-poly art does not need native GPU headroom; the polish is in lighting, post, animation and VFX, which three.js delivers (JUDGMENT).
3. All the novel work (server bots, LLM strategy, voice) is Node/Web code; native adds a build and distribution step with no gain (JUDGMENT).
4. A Windows build can be an afterthought: wrap the same web client in a desktop shell later if judges ask for "web and Windows." Not verified here; do not plan on it.
When native would win: you need 144fps first-person precision, anti-cheat, or huge scenes. None apply.

## 10. The 3 riskiest integration points: prototype these first (hour 0 to 1.5)

1. **Server-side bots on a navmesh inside the Colyseus tick.** Load the map glTF in Node, `await init()` recast, build navmesh, run a Crowd at a fixed step with interpolated positions, push positions through schema, render on two browsers, with LOS raycasts and server hitscan. Failure modes: WASM init/bundling in Node, navmesh gaps on your map geometry, crowd agents jittering in schema deltas, and tick budget with 8-10 bots. Kill criterion: if not walking and shooting by ~hour 1.5 use the fallback (Playroom host-authoritative, bots on host) or drop to waypoint graphs instead of Recast (JUDGMENT).
2. **LLM strategist + push-to-talk loop end to end.** One Node-side loop: snapshot of match state (compact JSON) -> LLM (every 3-5 s, plus between rounds) -> validated structured intents -> scripted bot layer; and a PTT path: mic -> STT (Web Speech, with a recorded-audio fallback for iOS) -> teammate agent -> intent + spoken reply via Runware TTS. Failure modes: latency (STT + LLM + TTS stacking), malformed JSON, API cost with many agents, key exposure. Mitigations: strict schema, timeouts with rules-only fallback, one LLM call per team rather than per bot, cache TTS lines, pre-render canned barks (all JUDGMENT).
3. **Original heroes: rig, retarget, animate, and hold frame rate on a mid laptop (desktop-only scope).** The pipeline AI mesh -> Mixamo auto-rig (neutral humanoid, clean mesh required; src: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) -> glTF -> three.js `SkeletonUtils.clone` with Quaternius UAL clips (rig compatibility with Mixamo noted on the Godot store listing: https://store.godotengine.org/asset/quaternius/universal-animation-library) can eat hours; also skinned-mesh/shadow cost on integrated-GPU laptops (lower risk than phones). Mitigation: ship 4 Quaternius-based heroes first, add generated heroes only if time remains, test on a second laptop, cap bots/skinned meshes.

Also keep in mind (lower risk but real): hosting a public WSS endpoint reachable from the second player's laptop; pointer-lock/mouse-aim controls are standard desktop three.js work (JUDGMENT); Colyseus 0.18 is new (prediction APIs "available in 0.18+"; src: https://docs.colyseus.io/netcode), so rely on the skill and pin versions.

## 11. Pre-event checklist (JUDGMENT, nothing here is code for the event)
- Pre-pick and test: host for the Node server, domain/tunnel with WSS, Anthropic/Runware keys in server env only, and a second laptop (Chrome/Edge) as the other human player.
- Pre-download CC0 packs (Toon Shooter Game Kit, Universal Base Characters, Universal Animation Library, Kenney props) so asset download is not on the clock; record licence lines in a CREDITS file.
- Read the event's rules on generated assets and whether pre-existing starter repos you wrote earlier count (the rule says all code written during the event).
- Decide the 4 heroes and 1-2 abilities each on paper tonight so the build is purely execution (abilities as data: cooldown, effect type, radius).

## 12. Unverified or not checked
Unity license terms, three.js/Babylon/Godot license text (well-known MIT/Apache but not fetched), Socket.IO docs, Nakama docs, Runware/Hunyuan3D output licence, repo licences for the section 7 GitHub examples, exact contents of the free Universal Animation Library (shoot clips), Playroom pricing.
