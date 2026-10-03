#!/bin/zsh
cd "$(dirname "$0")" || exit 1
CONFIG_FILE="$HOME/.config/tuteur-samuel/api.env"
if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  source "$CONFIG_FILE"
  set +a
elif [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi
open "http://127.0.0.1:4173"
npm start
