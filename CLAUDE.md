# HEEL TURN (MultiplayerAI) - project rules

- **Design stack on every visual change** (Aakash 2026-11-23 11:52, after I built the prototype HUD/arena and briefed two
  visual agents without it). Any work that changes what a player sees (3D scene, lighting, HUD, menus, animation, art)
  loads and applies: gstack, ui-ux-pro-max, taste-core, taste-redesign, impeccable, emil-design-eng, frontend-design.
  Every subagent brief for visual work pastes this line, and its report names one decision per skill. The pstack receipt
  line lists the design skills read when the turn is visual.
- **Visual work runs locally only** (2026-11-23 13:36). Agent37 cloud lanes do logic, data and services; anything a
  player sees is built or finished locally, where the design stack is installed. Cloud-made screens (promo overlay,
  odds panel, ladder HUD) get an impeccable pass before they ship.
- Plan, decisions and lessons: docs/PLAN.md, docs/decisions.tsv, docs/LESSONS.md. pstack receipt line on every reply.
- File ownership while parallel agents run: one agent per file; new work goes in new files or waits.
