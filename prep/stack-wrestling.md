# Wrestling game stack (research only, 2026-11-23)

## Recommended stack

| Slot | Pick | Fallback | Why | License |
|---|---|---|---|---|
| Characters | Quaternius Universal Base Characters (GLB) | KayKit Adventurers (Rig_Medium) | Same rig as the UAL clips, so no retarget step | CC0 both |
| Clips | Quaternius UAL1 + UAL2 | KayKit Character Animations (133) | Same skeleton, GLB, CC0; UAL2 has combos and melee | CC0 |
| Grapples/pins | Fake: one clip played on both bodies + snap/tween | Mixamo grapple clips, one per body | No free paired clips found | n/a |
| Physics | Hand-rolled 2D-on-plane + tweens; Rapier only for the throw arc | cannon-es | See risk 2 | Rapier Apache-2.0 |
| Multiplayer | Colyseus (authoritative) | Playroom Kit (client-authoritative) | See section 4 | Colyseus MIT |
| Ring | Low-poly ring GLB or 5 primitives | Procedural | Ring is boxes plus 3 rope cylinders per side | see section 5 |
| Crowd | InstancedMesh cards plus bob | None | Cheapest | n/a |

## Evidence

**1. Characters.** Quaternius Universal Base Characters are "compatible with the Universal Animation Library", CC0, FBX and glTF (https://quaternius.com/packs/universalbasecharacters.html). KayKit Adventurers are CC0 and updated for KayKit Character Animations (https://kaylousberg.itch.io/kaykit-adventurers). Kenney has no rigged wrestler-class humanoid that I confirmed. I did not check Ready Player Me successors. Mixamo characters are not recommended: Adobe account needed, and the terms allow use embedded in a product but not redistribution as standalone assets.

**2. Clips.**
- Quaternius UAL1 is 120+ clips on one humanoid rig, CC0, GLB/FBX/Blend (https://quaternius.com/packs/universalanimationlibrary.html). Clip names found on third-party pages: Punch_Jab, Punch_Cross, Hit_Chest, Hit_Head, Death01, Roll, Push, Dance_Loop, KipUp (the get-up candidate). tyrbo.ai also lists Hit_Shoulder_L/R, Hit_Stomach, and PunchKick_Enter/Exit.
- UAL2 is 130+ clips, with 3 and 4 hit combos split into hits and recoveries, melee, root motion variants, v2.2 on 2026-09-28, CC0, and "Compatible with other common rigs (Mixamo for example)" (https://quaternius.itch.io/universal-animation-library-2). Free standard zip is 17 MB. I did not see an official clip list, so check it in the pack. No kicks, throws or pins confirmed.
- KayKit Character Animations: 133 clips, CC0, FBX and glTF, Rig_Medium and Rig_Large, with unarmed melee, getting hit, death, emotes (https://kaylousberg.com/game-assets/character-animations).
- Mixamo is about 2,500 clips with boxing and wrestling categories (mocaponline.com, 2026). Terms: free commercial use embedded in a product, not redistributable as raw assets. It is not CC0 and needs an Adobe login. I did not verify the exact wrestling clip names.
- Paired grapple clips: only the paid Player Motion service (https://playermotion.games/answers/wrestling-and-grappling-animations) has matched attacker and defender pairs, plus 81 pro-wrestling moves. It costs credits. Free sets have none.

**3. Physics.** `@dimforge/rapier3d-compat` 0.21.0 on jsDelivr, Apache-2.0, WASM inlined as base64 so Vite needs no config (https://jsdelivr.com/package/npm/@dimforge/rapier3d-compat). A Rapier ragdoll in three.js exists as a reference (https://dev.to/mattvb91/realistic-ragdoll-physics-in-threejs-1pko, repo mattvb91/rapierjs-ragdoll). Ragdoll on a skinned GLB needs bone-to-collider mapping, which I judge to be a 2 to 4 hour sink and I did not verify the time. Cheaper option: kinematic character capsules and a scripted impulse arc. The rope check is a plane test and the elimination is an out-of-bounds test. cannon-es is fine too, but Rapier is the maintained one.

**4. Multiplayer.**
- Colyseus: MIT, authoritative, delta-synced schema state, rooms and matchmaking built in, `npm create colyseus-app@latest`, client `@colyseus/sdk`, a Three.js example list exists (https://github.com/colyseus/colyseus, https://docs.colyseus.io/learn/examples/threejs). Needs a host. I did not confirm a free tier on Colyseus Cloud. A Render or Fly free instance, or a Cloudflare/ngrok tunnel from the laptop, covers the demo.
- Playroom Kit: no server, lobby UI included, rooms by link. Free plan is 10 unique users per day and needs no API key (https://docs.joinplayroom.com/billing). Its own docs say it is for "client-authoritative / p2p" games, not authoritative servers (https://docs.joinplayroom.com/comparison).
- PartyKit: open source on Cloudflare (https://partykit.io). Authoritative via a room class, but you write the sync layer yourself.
- Pick: Colyseus, because the AI planner and wrestler scripts need one authoritative sim. Playroom is the fastest two-browser demo if the server hosting fights you.

**5. Ring and crowd.** Candidate rings: Sketchfab "Low-Poly Wrestling Ring" by TepidGames (444 vertices; I did not confirm its license), poly.pizza Boxing Ring (CC-BY, attribution required), 3dassets.dev fight stages pack (license unchecked). Safest is to build it: a box platform, 4 corner posts, 3 cylinder ropes per side, a canvas texture. Crowd: dark InstancedMesh capsules or sprite cards with a sine bob, behind the ropes, plus fog. Lighting: one warm top SpotLight over the ring with a shadow, dark ambient, bloom for the lights. These are tips from experience, not sources.

**6. Open-source references (structure only).** arjungali-hub/astral-clash (three.js 1v1 fighter, license unchecked), 2fbo/Fallward (MIT, three.js duel), Colyseus three.js examples, mattvb91/rapierjs-ragdoll. I found no web wrestling battle royal repo.

## Top 3 build risks and 20-minute probes

1. **Shared rig does not carry clips across.** Probe: load one Universal Base Character GLB and UAL Punch_Jab and Hit_Chest into an AnimationMixer in a blank Vite page. Pass if they play with no retarget. If not, test KayKit character plus KayKit animations.
2. **Grapples and throws look bad or the ragdoll sinks time.** Probe: play Push and Hit_Knockback on two characters at one origin, then tween the victim over the top rope with a spin. Decide fake or Rapier from that clip. Do not start a ragdoll.
3. **Server hosting and latency for link-join.** Probe: `npm create colyseus-app`, join two browser tabs through a tunnel URL, move one capsule each, and measure feel. If it fails, switch to Playroom with the host browser as the simulator.
