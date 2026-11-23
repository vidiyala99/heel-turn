# Build plan: hero tactical shooter (pstack Phase B architect + Phase C order, 2026-11-23 10:55)

Replaces the BAD CREDIT plan (git history). Frame: docs/FRAME.md. Video: docs/VIDEO.md. Stack: prep/stack-survey.md.
Hacking 11:30-13:00 and 14:00-18:00 (deadline announced at the event; we submit by 17:30, demo order = submit order).
Default pick is the shooter (Aakash: "both seem good"; shooter leads on fun, attention, Bruin fit). Switch only on his word.

## Architecture (one server owns truth; AI never sits in the aim loop)
```
browser (three.js + Vite)          Colyseus server (Node/TS)                  AI + data
- angled 3D camera, input  <--->  - room state @20 Hz, rounds, hitscan  --->  events.jsonl -> DuckDB
- push-to-talk (Web Speech)       - bots: waypoint graph, fast shoot          Bruin: events -> habit tables (+checks)
- plan panel, decision log        - every 4 s + round start: ask strategist   Claude strategists read habit tables,
- replay / director camera        - applies approved plan to its bots         post plans in BAND rooms; veto; human ok
                                                                              Runware TTS for hero replies
```

## Data shapes (fixed first, everything reads these)
- **event**: `{match, round, t_ms, actor, team, kind: move|spot|shot|kill|plant|defuse|callout|plan, x, z, site?, text?}`
- **habit tables (Bruin outputs)**: `player_site_pref(player, side, site, rounds, share)`,
  `player_opening(player, lane, rounds, share)`, `plan_outcomes(team, plan, rounds, win_rate)`
- **plan**: `{round, team, author_hero, plan: "stack_A"|"stack_B"|"split"|"fake_A_hit_B"|..., reason, cites:[table.row],
  vetoed_by?, approved_by?}` - the decision log is the list of plans.
- **metric (declared before the run)**: defender site-guess accuracy = share of rounds where the defenders stacked the
  site the attackers actually hit. Memory on vs memory off, same seeds, N rounds each.

## Heroes (original; 4, 2 abilities max)
Caller (plans, confident), Scout (reveals, terse, hands findings to the caller), Anchor (holds, cautious, vetoes risky
plans), Wildcard (flanker, trash talk). Names and art chosen at U2 from CC0 packs. No Valorant names, maps or sounds.

## Build order (each unit ends in a check; capture its clip as soon as the check passes)
| # | Unit | Target | Check (VERIFIED only on the real artifact) |
|---|---|---|---|
| U0 | Scaffold: Vite + three client, Colyseus server, one `npm run dev` | 11:45 | page loads, server logs a join |
| U1 | **Two browsers in one room** (riskiest, first) | 12:30 | 2 tabs + second laptop see each other move; record clip |
| U2 | Map + 4 heroes from CC0 packs, angled camera, lighting | 13:00 | screenshot judged "good enough" by Aakash |
| U3 | Rounds (plant/defend, 2 sites), bots on waypoint graph, hitscan | 14:45 | a headless bot-vs-bot round ends with a winner |
| U4 | Event stream -> events.jsonl -> DuckDB | 15:00 | row counts per kind for one round |
| U5 | Bruin pipeline: habit tables + checks (+ inference asset labelling callouts) | 15:30 | `bruin run` green; a planted bad row fails a check and blocks downstream |
| U6 | Strategists (Claude) + BAND rooms: caller plans, scout handoff, anchor veto, human approve | 16:15 | Band console shows handoff + veto + approval for one round; decision log on screen |
| U7 | Learning batch: N headless rounds memory on vs off -> chart | 16:30 | chart shows N and both lines (overlap reported honestly) |
| U8 | Push-to-talk -> strategist -> Runware voice reply | 16:45 | reply under 3 s, measured |
| U9 | Replay/director cam, README ("Bruin Features Used"), AdaL cut, submit | 17:30 | VIDEO.md Phase E checklist passes |

**Cut order if behind** (last first): U9 replay cam -> U8 voice (keep text chat) -> inference asset -> 4th hero.
**15:00 checkpoint:** if U3 is not done, fall back to bots vs bots plus one human (FRAME.md) and say so.
**Never cut:** U1, U5 checks, U6 BAND veto + approval, U7 chart with baseline (these are the prizes).

## Needs from Aakash at the venue
- Confirm the shooter (or say wrestling now, before U0).
- Keys: BAND, Runware, Anthropic (Bruin inference + strategists), Telem only if used.
- The announced deadline and whether a public GitHub repo is required at submit (making it public is his call).
- Ask the Bruin team at their demo what they judge on; note answers in docs/decisions.tsv.
