# HEEL TURN memory: a Bruin pipeline

The AI wrestlers in HEEL TURN remember you. Every strike, betrayal and taunt becomes an event.
Bruin turns the events into checked tables on DuckDB, and the wrestlers query those tables before
every plan. "p1 strikes 54% of the time at the opening bell, so block." "Silas betrayed me in m2,
grudge 3, so refuse his offer." If a corrupt event gets in, a check fails and the marts are not
refreshed. The wrestlers keep acting on the last good memory instead of a bad one.

```
fixtures/events.jsonl ─┐
data/events.jsonl ─────┴─> raw.events (python) ─> staging.stg_events (sql + checks) ─┬─> marts.habits
seeds/wrestlers.csv ─> seeds.wrestlers (seed) ─────────────────┘                     ├─> marts.relationships
                                                                                      ├─> marts.leaderboard
                                                                                      ├─> marts.counter_rate
                                                                                      └─> marts.taunt_tone (OpenAI inference)
```

## Run it

```bash
curl -LsSf https://getbruin.com/install/cli | sh   # Bruin CLI
bash bruin/run.sh                                  # refresh memory. Skips taunt_tone if OPENAI_API_KEY is unset
bash bruin/prove_bad_row.sh                        # plant a corrupt event and watch the marts get blocked
bash bruin/query_examples.sh                       # the queries the wrestlers run
python3 bruin/lineage.py                           # asset + column lineage -> docs/lanes/bruin-lineage.txt
python3 bruin/fixtures/gen_events.py               # regenerate the 464 fixture events
```

The live game appends one JSON event per line to `bruin/data/events.jsonl`. When that file is
empty or missing, the pipeline reads `bruin/fixtures/events.jsonl`, four scripted matches with two
humans who have distinct habits, four AI wrestlers, an alliance, a betrayal and its grudge.

## Bruin Features Used

| Feature | Where | What it does here |
| --- | --- | --- |
| **Python asset** (`type: python`, uv-managed `requirements.txt`) | `assets/raw/events.py` | Reads the JSONL event log into `raw.events` with `materialize()` returning a DataFrame |
| **Seed asset** (`duckdb.seed`) | `assets/seeds/wrestlers.asset.yml` | Loads the roster CSV. Checks reference it |
| **SQL assets on DuckDB** (`duckdb.sql`, table materialization) | `assets/staging`, `assets/marts` | Staging plus four marts the game reads |
| **Built-in column checks** | every asset | `not_null`, `unique`, `accepted_values` on `kind` and `situation`, `positive`, `non_negative`, `min`/`max` |
| **Custom checks** (`custom_checks`) | stg_events, habits, relationships, leaderboard | Actor must be on the roster. Habit share must be in (0, 1] and sum to 1. A relationship can't name an unknown wrestler. One winner per match |
| **Blocking checks / UPSTREAM FAILED** | the whole DAG | A failed staging check skips every mart, so the AI never reads poisoned memory ([proof](../docs/lanes/bruin-checks.txt)) |
| **Inference asset** (`type: inference`, `provider: openai`, `choices`) | `assets/marts/taunt_tone.asset.yml` | Labels each taunt `heel`/`face`/`neutral` with structured output, with result caching and its own `accepted_values` check |
| **Tags + `--exclude-tag`** | `run.sh` | Runs the inference asset only when `OPENAI_API_KEY` is set |
| **Env-var connection secrets** | `.bruin.yml` | `api_key: "${OPENAI_API_KEY}"`. No key on disk |
| **Lineage + column lineage** | `bruin lineage --full`, `bruin internal parse-pipeline -c` | Column lineage parsed from the SQL, e.g. `habits.move <- stg_events.kind <- raw.events.kind` ([dump](../docs/lanes/bruin-lineage.txt)) |
| **`bruin query` with Jinja `--var`, JSON output** | `queries/*.sql`, `memory.mjs` | The wrestlers' pre-plan lookups. Each row carries a `cite` the decision log shows ([examples](../docs/lanes/bruin-queries.txt)) |
| **`bruin run --only checks`** | `prove_bad_row.sh` | Re-checks marts that were tampered with in place, without rebuilding them |
| **`bruin validate`** | run before every `bruin run` | Catches config errors, e.g. an inference asset with no warehouse connection |

## Marts

- `habits(player, situation, move, n, share)`: what each fighter throws in each situation.
- `relationships(a, b, trust, grudge, last_betrayal)`: how `a` feels about `b`. Trust starts at
  0.5, gains 0.25 per accepted alliance, loses 0.5 per betrayal and 0.1 per refused offer, and is
  clamped to [0, 1]. Grudge = 2 × betrayals + eliminations.
- `leaderboard(wrestler, wins, eliminations, betrayals)`.
- `counter_rate(match, human, human_moves, countered, counter_rate)`: the declared learning
  metric. It is the share of human moves that the targeted AI answered within 3 s with the move
  that beats them.
- `taunt_tone(event_id, tone)`: OpenAI label for each taunt.
