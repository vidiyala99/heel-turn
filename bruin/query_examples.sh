#!/usr/bin/env bash
# The bruin query calls an AI wrestler makes before each plan. bash bruin/query_examples.sh
set -euo pipefail
cd "$(dirname "$0")"
ex() {
  local name=$1; shift
  local vars=()
  for kv in "$@"; do vars+=(--var "$kv"); done
  echo "\$ bruin query -c duckdb-default -q \"\$(cat queries/$name.sql)\" ${vars[*]}"
  bruin query --config-file .bruin.yml -c duckdb-default -q "$(cat "queries/$name.sql")" "${vars[@]}"
  echo
}
ex habits_for player=p1 situation=opening
ex counter_pick player=p2 situation=cornered
ex feelings_of me=brutus
ex leaderboard
echo "\$ node memory.mjs counter_pick player=p1 situation=after_block   # what main.js gets"
node memory.mjs counter_pick player=p1 situation=after_block
