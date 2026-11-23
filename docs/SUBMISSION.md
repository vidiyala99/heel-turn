# Submission form answers

**Title:** HEEL TURN

**Tagline:** AI wrestlers that remember how you fight, and betray each other when the commissioner lets them.

**Track:** 02, Create Co-op Games with Agents

**Short description (form, two sentences):** HEEL TURN is a 3D browser wrestling game where two humans share one ring
with four LLM wrestlers and a corruptible LLM referee. The wrestlers read your fighting habits from a Bruin pipeline,
scheme in private BAND rooms, and a human commissioner approves or blocks every betrayal.

**Description (218 words):**

HEEL TURN is an original 3D wrestling game that runs in the browser. Two humans join one ring by link. Four AI
wrestlers (Vex the showboat, Brutus Kane the brute, Silas Crane the schemer, Old Iron Mae the veteran) and referee Lou
Varga are each their own BAND agent with their own goals and memory.

Every strike, alliance, betrayal and taunt becomes an event. A Bruin pipeline turns those events into checked DuckDB
tables: your habits per situation, who trusts whom, grudges, a referee bribe ledger and live odds. Before each plan,
every wrestler queries those tables, and the decision log shows the row it cited. If a corrupt event gets in, a check
fails, the marts are not refreshed, and the wrestlers keep the last good memory.

In the Over the Top battle royal, entrants join mid-match through BAND, alliances are offered and answered in private
locker rooms, and the schemer proposes a betrayal. The human commissioner approves or blocks it. Same seed, different
verdict, different ending.

Commentators, the ring announcer and the wrestlers speak with Fish Audio voices on Runware. Promos quote what memory
says about you.

We measured learning honestly: over 32,000 headless matches, memory raised the counter rate by 0.9 to 2.5 points, with
confidence intervals. That is small, and the README says so.

**Sponsor tools used:**
- **Bruin:** the wrestlers' memory, from events through checked staging into habits, relationships, ref_ledger, odds
  and an OpenAI inference asset that labels taunts, with a planted bad row that blocks the refresh.
- **BAND:** five agents with their own keys talk in private locker rooms, add a runtime entrant with
  `band_add_participant`, hand off alliance offers and replies, and wait on the human commissioner's approve/block.
- **Runware:** Fish Audio S2.1 Pro voices every speaker in the arena, chosen over HeyGen and Inworld in a same-line A/B
  on Runware.
- **AdaL:** cut, titles and captions for the demo video.
- **OpenAI** (not a sponsor): `gpt-4o-mini` plans, promos and the Bruin inference asset, picked by measured latency.

**What's next:**
- Recency-weighted habits, so the AI adapts when a player changes style (today counts never decay, and the measured
  edge vanishes after a style switch).
- A next-move model in place of share counting, scored against the same counter-rate metric.
- Tag team mode with AI partners whose trust comes from `partner_trust`, and the ladder match on the same agent layer.
- Spectators betting fan points on the odds panel during a live online match.
- Live game events through the full Bruin refresh after every match, not only fixtures and test runs.

**Links:** repo (this repository), demo video (`docs/VIDEO.md` shot list), live app (`cd game && npm run dev`).
