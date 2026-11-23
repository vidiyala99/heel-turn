# Round 2, candidate C (main session): "Continuity" (Track 1 film)

**Concept.** A writers' room where every character is played by a different AI (Claude, Gemini via Antigravity,
GPT, an open model), each a separate BAND agent with its own goal, improvising a short film scene by scene. The story
bible is a database and **Bruin is the showrunner**: world state lives in tables (who is alive, where, holding what,
who trusts whom), and continuity rules are Bruin quality checks ("dead characters do not speak", "nobody is in two
places", "a door locked in scene 3 stays locked"). Every proposed scene is a pipeline run; a failed check rejects the
scene on screen ("CONTINUITY ERROR") and the agents must rewrite. Bruin's lineage graph becomes the plot's cause-and-effect
map. Two runs of the same opening produce different, continuity-clean endings.

**Why it is not a wrapper or a cliché.** Nobody uses a data-quality tool as the laws of physics of a story. Data people get
the joke instantly ("dbt for fiction"), and story people get a film with no plot holes.

**Sponsors pushed to their limits**
- **Bruin:** world-state tables, checks as continuity law, an **inference asset** (Bruin's newest feature) that has a model
  tag each scene's tone/stakes as a typed column, the semantic layer for "tension over time", lineage graph as plot map.
- **BAND:** each character is a different model/harness in one room (BAND's core pitch: agents from different tools
  talking); private side-rooms for scheming; cognee integration so characters remember across takes.
- **Telem:** a "breaking news" beat each take is a live headline pulled across several engines through Telem, so the
  world reacts to today's internet. Trace ids on screen.
- **Runware:** directed Gemini TTS voices per character; portraits; stretch: HeyGen Avatar 6 lip-synced close-ups.
- **AdaL:** the cut.

**Risk.** Multi-model setup cost (keys); keep a single-model fallback with distinct personas.
