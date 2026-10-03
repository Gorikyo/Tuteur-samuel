#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi
open "http://127.0.0.1:4173"
npm start
