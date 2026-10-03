#!/bin/zsh
cd "$(dirname "$0")" || exit 1
open "http://127.0.0.1:4173"
npm start

