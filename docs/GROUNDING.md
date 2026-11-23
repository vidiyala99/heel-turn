# Grounding for the design round (pstack figure-it-out, Phase A, 2026-11-23 00:05)

## Builder profile (sources: Resumes/2026-11-12/resume.tex, github.com/vidiyala99 66 repos)
- **Founder, Actintro** (Sep 2026-): full-stack AI product that finds the best people to meet for any goal; models rooms
  of 900+ people as a knowledge graph AI agents research and validate; deterministic checks so no match is made up;
  right-sized models per task; 50+ beta testers. Lives in SF's event scene.
- **Infosys for Southern California Edison** (2021-2024): Snowflake/Snowpark billing pipelines 1h+ to 20 min, ~50% cost;
  week-long manual data check to an automatic daily job with zero errors; forecasting caught a faulty meter before
  bills; only ML engineer, led 3, mentored 3.
- **TrueBind**: insurance AI that shows its work, piloted with 5 agencies, 4 h to 20 min.
- **Open source**: Dagster (merged fixes), polars fork, SDK work for Exa, PlanetScale, WorkOS (merged), Black Forest Labs,
  Parallel, assistant-ui.
- **Hackathons**: actintro-followups (Long Horizon Agents Hack: agent that learns your style without re-reading history),
  Landfall (agent-readiness factory), Marque (scoped multi-agent orchestration).
- **Signature across ~15 repos**: show-your-work systems (postcheck, answer-check, broker-docs-verified,
  joulent-company-brain, payroll-import-gate, TrueBind): every output traced to a source, with tested checks.
- **Range**: design taste (portal, harbor world), consumer (leetcode-sensei iMessage coach with memory, Orbit events map,
  pawprint shelters), sports data (IPL analytics with dbt, cricket pipelines).
- **Not a gamer** (2026-11-22). Must enjoy building and demoing the result.

## Premise test
Premise every earlier design assumed: "sponsor judges reward a sponsor tool made load-bearing inside the project."
- **BAND: VERIFIED** (band.ai/hacker-guide, "Meaningful Use"): the delete test. At least one of: dependent handoff
  (next agent answers the finding), roster decided at runtime (`band_lookup_peers` -> `band_add_participant`), a boundary
  Band enforces (mention-scoped visibility, contact requests), a verdict that can be blocked (critic with veto). Strongest
  have 2-3. Does not count: status posts, one process with hats, own orchestrator calling agents in turn, a dashboard as
  the deliverable. End on a decision a named human approves or blocks, in the room. Show the Band console room.
- **Bruin: INCONCLUSIVE** (no published criteria). Blog themes: agentic data engineering (agents that build and repair
  pipelines), self-healing pipelines, data contracts, AI context layer, "How do I know the AI's answer is correct?",
  AI data analyst, MCP, data apps, inference assets. Confirm at the 10:30 sponsor demo.
- Telem, Runware, Glasser: inferred from LinkedIn and event-site hints only (`prep/sponsor-signals.md`).

## Hard exclusions (encoded so they cannot drift back in)
1. No organizer recipe and no track-brief example as the core idea: Gala Whodunit, Breaking News Live, Zombie Night Co-op,
   The Agent Market, The Interview Panel, Language Buddy Cafe; heist with traitor, sinking-ship escape pod, courtroom
   verdict, survival island tribes, trading town merchants, social deduction impostor, interview panel, office simulator,
   driving test, sales buying committee; and anything that is a reskin of one (BAD CREDIT = The Agent Market).
2. No "agents verify claims/quotes in a 3D scene" (the Telem SearchHack cliché).
3. Nothing about job seeking.
4. Not a recreation of an existing named game (Among Us, Mafia/Werewolf as-is).
