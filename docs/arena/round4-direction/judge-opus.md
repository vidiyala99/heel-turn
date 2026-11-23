# Judge: opus (round 4 direction)

## Gates
- **G1, A (shooter): CONDITIONAL.** Attack/defend with a bomb to plant and defuse plus hero abilities is the core loop of Valorant/CS (exclusion 4, `docs/GROUNDING.md:40`), and "The Siege (3D)" is a listed Track 2 idea (`prep/event-site.md:64`; exclusion 1, `GROUNDING.md:34-37`). It needs a new objective to pass cleanly.
- **G1, B (wrestling): PASS.** Not a recreation of a named game. Rename "Royal Rumble" (a WWE trademark) to something like "Over the Ropes".
- **G2, A: WEAK PASS.** Fixed teams make "ally/trade/betray" (`prep/sponsors.md:64`) feel forced. A betrayal in a team shooter is just friendly fire.
- **G2, B: PASS.** Rumble alliances and heel turns *are* ally/betray. An agent-only world event is easy to show: two AI wrestlers collude and eliminate the human favourite, logged with its causal chain (`sponsors.md:104`).

## Scores (1-10; weighted out of 100)
| # | Criterion (wt) | A | B | Basis |
|---|---|---|---|---|
| 1 | Bruin (25) | 6 | 8 | Ledger, memory mart and checks fit both (`sponsors.md:102-105`). B's promos, taunts and grudges are text, a good fit for typed `inference` columns with checks (`GROUNDING.md:43-47`). A's data is mostly position telemetry. |
| 2 | BAND (20) | 7 | 9 | B: entrants join at runtime (`band_lookup_peers` -> `band_add_participant`), tag-partner side-rooms limited by mention, and a referee/commissioner veto. The human commissioner approves or blocks the heel turn or DQ (`GROUNDING.md:23-27`). A: team radio rooms, but the roster is fixed. |
| 3 | Other sponsors (10) | 5 | 7 | B: Runware per-wrestler TTS for taunts and commentators is load-bearing (`sponsors.md:141`), and Telem can pull real-world banter fodder. A: voice barks only. |
| 4 | Originality / remove-AI (15) | 4 | 8 | A: a 1 s model cannot aim (brief), so Yuka bots do the real play (`prep/stack-survey.md:75`) and the LLM is a thin strategist. B: the model writes the promos, chooses the betrayals and calls the play-by-play. |
| 5 | Judge form (10) | 6 | 8 | "Run it twice, the outcome changes" (`event-site.md:42`) reads instantly as a different Rumble winner and a different betrayal. |
| 6 | Fun / attention (10) | 6 | 8 | Spectacle plus commentary is clip-shaped. The compounding is in spectator mode and join links (`prep/attention-teardown.md:96`). AI shooter clips have almost no organic signal (`attention-teardown.md:38`). |
| 7 | Solo 5.5 h (10) | 3 | 6 | A needs netcode with prediction, rewind and a navmesh (`stack-survey.md:9-13`), plus rigging risk (`stack-survey.md:151`), from a non-gamer (`GROUNDING.md:19`). B runs in turns, so 1 s model calls fit and it can host-relay over Playroom. |
| | **Weighted total** | **55.0** | **79.0** | |

**What to cut first in B:** tag-team mode (keep the Rumble), then real grapple animations (swap in knockback impulses plus over-the-top-rope ejection physics), then live Telem.

## The facts that decide it
1. **1 s model latency.** A shooter puts the model off the critical path. Round-based wrestling puts it on every beat. That flips criteria 4, 6 and 7.
2. **Betrayal is native to B and foreign to A.** G2 and the BAND delete test both reward that (runtime roster, private side-rooms, a veto that can be blocked).
3. **A carries a G1 risk.** A bomb plant/defuse loop is a recognizable named-game loop and close to a listed track idea.

## Pick: **B, Wrestling.**

## Strongest case for A
"Agents learn strategy" can be measured in A: site-hold rates, rotation timing and win rate per learned playbook, charted from a Bruin mart across rounds. That is harder to fake than "learned a better taunt". 3D tactical shooters also look technically impressive on the Execution and Implementation rows. If Aakash had a teammate who does netcode, A's ceiling is real.

## What the grounding gets wrong or misses
- `prep/stack-survey.md` covers only the shooter (line 1). B has no stack research, which biases the build-risk comparison. Missing for B: a CC0 wrestling/grapple animation check, plus a ring and ropes physics approach.
- Exclusion 4 does not name Valorant/CS, though A's bomb loop is exactly that. It should.
- No trademark check on names ("Royal Rumble").
- Bruin judging criteria are still INCONCLUSIVE (`GROUNDING.md:28-30`). Criterion 1 carries 25% weight on an unconfirmed premise, so confirm it at the 10:30 sponsor demo.
- Lingcode is a $200 prize marked "off-theme" (`sponsors.md:83`). Nothing tests whether it could be used for real, so criterion 3 undercounts it for both directions.
