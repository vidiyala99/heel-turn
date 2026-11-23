#!/usr/bin/env bash
# Refresh the game memory: bash bruin/run.sh [extra bruin run flags]
# Skips the inference asset (taunt_tone) when OPENAI_API_KEY is unset.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data
extra=()
if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "OPENAI_API_KEY unset: skipping the inference asset marts.taunt_tone"
  extra+=(--exclude-tag inference)
fi
exec bruin run --config-file .bruin.yml "${extra[@]}" "$@" .
