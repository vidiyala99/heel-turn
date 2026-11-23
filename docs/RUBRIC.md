# Fixed design rubric (written before the design round; do not change after scoring starts)

pstack explain-the-number: the decision rule and noise floor are set before the run.

| # | Criterion | Weight | Scored from |
|---|---|---|---|
| 1 | Hard exclusions pass (GROUNDING.md list) | gate | any fail = out |
| 2 | Track must-haves + "run it twice" provable | gate | event-site.md |
| 3 | Bruin is essential, in the shape Bruin is pushing (agents + pipelines + provable correctness) | 20 | GROUNDING.md premise test |
| 4 | BAND passes the delete test with 2+ signals and ends on a human approve/block | 15 | band.ai hacker guide |
| 5 | Builder's edge: grows from Aakash's real work (Actintro, SCE pipelines, show-your-work repos, Dagster) so the pitch has real depth | 15 | GROUNDING.md builder profile |
| 6 | Originality vs the room (not a recipe, not a cliché, not a reskin) | 15 | exclusions + winner-signals.md |
| 7 | Judge form: Presentation, Execution, Innovation, Impact (investable), Implementation | 15 | event-site.md |
| 8 | Fun to watch and to demo for a non-gamer builder; attention potential | 10 | attention-teardown.md |
| 9 | Solo buildability in 5.5 h on Windows with a cut list and a 15:00 fallback | 10 | sponsors.md |

Other sponsors (Telem, Runware, Glasser, AdaL) count inside #3/#7 only when they are essential, never as bolt-ons.

**Noise floor:** two independent judges score every candidate. A pick counts only if its lead over the runner-up is larger
than the larger judge-to-judge spread on any candidate. Otherwise the top two go to Aakash as a choice (product direction
comes from the human).
