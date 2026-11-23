# Build plan: HEEL TURN, an AI wrestling battle royal (pstack multi-phase plan, 2026-11-23 11:20)

Direction decided by two blind judges (docs/arena/round4-direction/synthesis.md). Replaces the shooter plan (git a4f6bbe)
and supersedes docs/FRAME.md (shooter). Stack picks come from prep/stack-wrestling.md (research running at 11:20).
Hacking 11:30-13:00 and 14:00-18:00; we submit by 17:30 (demo order = submit order). Working title "HEEL TURN".
No WWE marks: original wrestlers, original names, the battle royal is called "Over the Top", never "Royal Rumble".

## Finish line (checked at 17:30)
1. **Playable by link:** two humans on two laptops wrestle in one 3D ring with 4+ AI wrestlers. No setup.
2. **Must-haves on screen:** 4 AI wrestlers with distinct look, gimmick and voice; they move, fight, taunt; a decision
   log shows every plan, alliance and betrayal with its reason and the habit rows it cites.
3. **Learning proven:** chart of a pre-declared metric (AI counter rate against each human's habits) over N headless
   matches, memory on vs memory off. If the lines overlap, we say so.
4. **Memory visibly changes a decision:** a logged grudge (Bruin `relationships` row) turns an ally into a betrayal or run-in, shown in the log.
5. **BAND:** locker-room rooms the other side cannot see, a new entrant added mid-match at runtime, an alliance offer
   answered by its target, and a betrayal that the human commissioner approves or blocks in the room. Console shown.
6. **Bruin:** events -> checked tables -> marts the wrestlers read before every plan; a planted bad row fails a check and
   blocks the memory refresh; inference asset labels taunts; lineage shown; README "Bruin Features Used".
7. **Shipped:** public repo, 1-3 min AdaL video, submitted by 17:30.

## Domain model (data shapes first; everything reads these)
- **Fight triangle** (makes habits learnable): strike beats grapple wind-up, grapple beats block, block beats strike;
  stamina drains on each; low stamina opens knockdown -> pin (3 count, kickout chance) or toss over the top rope
  (elimination). Input: J strike, K grapple, L block, Space taunt (taunt refills crowd meter = momentum).
- **event**: `{match, t_ms, actor, kind: strike|grapple|block|reversal|knockdown|pin|kickout|elimination|entry|taunt|
  alliance_offer|alliance_reply|betray|plan|commentary, target?, situation: opening|after_block|low_stamina|cornered,
  success?, text?}`
- **Bruin marts**: `habits(player, situation, move, n, share)`, `relationships(a, b, trust, grudge, last_betrayal)`,
  `leaderboard(wrestler, wins, eliminations, betrayals)`, `taunt_tone(event_id, tone)` (inference asset).
- **plan** (= decision log row): `{t_ms, wrestler, intent: target|counter|ally|betray|pin|toss|taunt, target, reason,
  cites: [mart.row], room, vetoed_by?, approved_by?}`
- **metric (declared now)**: counter rate = share of human moves met by the move that beats it, per match; memory on
  vs off, same seeds, N matches each (N set by what fits in 20 min of headless runs).

## Cast and treachery (Aakash 12:28: referee and tag partners are agents who can betray; agents learn)
Every character below is its own BAND agent with its own memory in Bruin. Commentators narrate only.
- **Wrestlers (4):** Vex (showboat), Brutus Kane (brute), Silas Crane (schemer), Old Iron Mae (veteran).
- **Referee "Lou Varga" (agent):** counts pins and calls rope breaks. Honest by default, but corruptible: a heel can
  offer a bribe in a private BAND room, and Lou weighs it against his reputation (how often he got caught, crowd heat).
  He can fast-count, slow-count, or "miss" a rope break. The bribe offer goes to the human commissioner in the room, who
  approves or blocks it (blockable verdict). Caught bribes cost Lou reputation, which he remembers next match.
- **Tag partners (AI):** your AI partner trusts you or not, from the `relationships` mart (who saved whom, who tagged
  out at the wrong time). Low trust and a better offer from the other side -> a heel turn: walks out, cheap shot, or
  refuses the tag. A visible trust meter warns the human.
- **Sabotage:** distraction plays (one agent argues with the ref while a partner cheats), run-ins in the battle royal,
  low blows only when the ref is not looking (the ref agent's attention is part of the state).
- **Learning (all agents, from Bruin marts):** counter rate vs each human's habits (the charted metric, memory on vs
  off); trust and grudges updated after every betrayal so alliances change match to match; the ref's bribe ledger. The
  decision log cites the mart row behind every plan, bribe and betrayal.
- **New Bruin marts:** `ref_ledger(ref, match, bribe_from, accepted, caught)`, `partner_trust(a, b, trust, last_event)`.
- **Tom & Jerry** (BAND onboarding demo, registered 12:24, verified replying) are a connection smoke test only, not cast.

## Agents (each its own BAND agent; LLM = OpenAI, chosen by measured latency)
4 original wrestlers with gimmicks (picked at U2): the showboat, the brute, the schemer (betrays first), the veteran
(reads habits, counters). 2 commentators (play-by-play + color) voiced by Runware; they narrate, not counted for BAND.
Scripted fighters execute moves at frame rate; the LLM sets each wrestler's plan every ~4 s and on entry, knockdown, or alliance offer.

## Build order (each unit ends in a check; record its clip the moment the check passes)
| # | Unit | Target | Check |
|---|---|---|---|
| U0 | Scaffold client + server from stack-wrestling.md picks, `.env` loaded, one dev command | 11:50 | page loads, server logs a join |
| U1 | **Two browsers in one ring room** (riskiest first) | 12:30 | two laptops see each other move; clip |
| U2 | Ring, lights, crowd; 4 rigged wrestlers with idle/walk/punch/hit/knockdown | 13:00 | screenshot Aakash calls good enough |
| U3 | Fight triangle, stamina, pin, over-the-top elimination; scripted AI fighters; entries every N s | 14:45 | a headless match ends with a winner; a live 2-human match runs |
| U4 | Events -> events.jsonl -> DuckDB | 15:00 | row counts per kind for one match |
| U5 | Bruin: staging + checks, marts, inference asset on taunts | 15:30 | `bruin run` green; planted bad row fails and blocks the marts |
| U6 | LLM wrestlers in BAND: locker rooms, runtime entrant join, alliance offer/reply, betrayal -> commissioner approve/block; decision log panel | 16:15 | Band console shows all four for one match; grudge row cited in a betrayal |
| U7 | Learning batch, memory on vs off -> chart | 16:30 | chart shows N and both lines |
| U8 | Commentators + taunts voiced (Runware), leaderboard screen | 16:50 | voice line plays under 3 s after the event, measured |
| U9 | VIDEO.md shot list re-cut for wrestling, README, AdaL edit, submit | 17:30 | VIDEO.md Phase E checklist passes |

**15:00 checkpoint:** if U3 is not done, ship one human + AI wrestlers, recorded, and say so (solo-demo fallback).
**Cut order (first to go):** tag-team mode (not in core) -> paired grapple animations (knockback + rope toss instead) ->
voice push-to-talk to a partner -> generated entrance cards -> commentator voices (text captions stay).
**Never cut:** U1, U5 checks, U6 BAND approve/block, U7 chart with baseline, finish-line item 4.

## Open, settled by U0/U2 probes (not by asking)
- Stack picked (prep/stack-wrestling.md): Quaternius Universal Base Characters + Universal Animation Library 1/2 (CC0, one
  rig, GLB; fallback KayKit); kinematic fighters, grapples faked (one clip on both bodies, tweened rope toss), Rapier only
  if needed; Colyseus authoritative rooms (fallback Playroom Kit), hosted via tunnel/Render; ring from primitives,
  InstancedMesh crowd. Probes: U0 rig + Punch_Jab/Hit_Chest in a blank page; U1 two tabs through a tunnel URL;
  U3 two-body grapple + rope toss tween.
- Whether Bruin inference with `provider: openai` runs locally (U5; the pipeline stands without it).

## Needs from Aakash
BAND, Runware, OpenAI keys in `MultiplayerAI/.env`; the announced deadline; Bruin judging criteria from the sponsor
desk; a second laptop for U1 and the video.
