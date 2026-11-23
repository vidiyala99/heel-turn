# Direction pick: shooter vs wrestling (pstack figure-it-out, 2026-11-23 11:00)

Aakash's ask: pick ONE of his two directions by "does it push the sponsor tools to their limits". Other genres (fighting,
board, stealth) set aside per his call. Grounding: prep/sponsors.md (tool facts, BAND delete test, T2 rules),
docs/FRAME.md, prep/attention-teardown.md.

## Finish line
One direction, scored sponsor by sponsor against what each tool can do at its limit, with the Track 2 gate checked.

## Bedrock (first principles)
- A language model is slow (~1 s) and great at words, social reasoning, plans and stories. It is useless at aim.
- So the winning design puts the model where only a model can do the job (judges run the "remove the AI" test).
- Track 2 gate (event page): 2+ humans, 3+ agents with own goals/memory, agents **can ally/trade/betray**, one major
  world event caused by agents alone.

## Sponsor by sponsor
| Sponsor (prize) | Shooter (spike plant/defuse, abilities, leaderboard) | Wrestling (tag team + Royal Rumble, commentators) | Edge |
|---|---|---|---|
| **Bruin** ($1000/$500, mandatory) | Rich spatial events -> habit tables (site, lane, ability use); site-guess metric; leaderboard | Move/reversal events -> habit tables (openers, reversal timing, favorite finisher); counter-rate metric; leaderboard + storyline tables (feuds, betrayals) | even, shooter slightly richer data |
| **BAND** ($500, delete test) | team rooms (boundary), scout -> caller (handoff), anchor veto = 3 signals | locker-room rooms (boundary), Rumble entrants join mid-match via `band_lookup_peers`/`band_add_participant` (**runtime roster is the mechanic**), alliance offer -> accept or betray (handoff), partner veto + human approves the double-team = 4 signals | **wrestling** |
| **Runware** ($200) | short voice callouts | 2 commentator voices calling every move, wrestler promos/taunts, generated entrance cards | **wrestling** |
| **Telem / Glasser / Lingcode** | no honest use | no honest use | skip both (bolt-ons do not count) |
| **AdaL** (video) | clean tactical footage | betrayal + commentary = the beats that spread (attention teardown) | wrestling |

## Gates and risks
| Check | Shooter | Wrestling |
|---|---|---|
| T2 "ally/trade/betray" | **weak**: teammates are fixed; betrayal does not fit | **native**: alliances and heel turns are the genre |
| Agent-caused world event | agent-called retake (thin) | an AI heel turn in the Rumble that the humans did not see coming |
| "Remove the AI" test | strategy calls every few seconds; classic game bots already do this | promos, alliance talks, betrayals, live commentary: only a model does these |
| Originality vs the room | "AI plays a hero shooter" exists | AI wrestling federation with storylines that learn you: rare |
| Solo build in ~5.5 h | hardest: map design, navmesh bots, hitscan, abilities, traps, spike | smaller: one ring, few bodies, no pathfinding; risk = fight animations (paired grapples) |
| Looks good fast | needs a well-built map | ring + lights + crowd reads well with little art |

## Verdict: wrestling
It wins BAND, Runware and the video outright, ties Bruin, passes the Track 2 betrayal gate the shooter fails, and is the
smaller build. The shooter's real advantage is fun and Aakash's love for the genre; it loses on the criterion he set.
This reverses my earlier shooter lean (FRAME.md): that lean was scored before "push the sponsor tools" and the T2
betrayal gate were weighed. Product direction is Aakash's: he confirms before PLAN.md is rewritten.

## Shape of the wrestling build (for the plan, if confirmed)
- **Modes:** tag team (Aakash + friend each paired with an AI partner) and a Royal Rumble (AI entrants every N s).
- **Fighting:** real-time strikes/grapple/block/pin with stamina, driven by fast scripted fighters; the model decides
  the plan per exchange (who to target, when to tag, when to betray) and talks.
- **Learning (the proof):** AI opponents read Bruin habit tables of each human (openers, reversal timing) and counter;
  counter rate across N matches vs memory off, charted.
- **Risk to cut first:** paired grapple animations -> strikes, knockdowns and pins only (Mixamo/Quaternius clips).
