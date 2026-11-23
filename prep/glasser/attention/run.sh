#!/bin/bash
# usage: run.sh name endpoint json
export MSYS_NO_PATHCONV=1
T=tsk_b61a14a6198003d6
glasser run -j -p anyapi -e "$2" --endpoint-version 1 --idempotency-key "att-$1" --task $T --wait -i "$3" > "$1.json" 2>"$1.err"
echo "$1 $(wc -c < $1.json)"
