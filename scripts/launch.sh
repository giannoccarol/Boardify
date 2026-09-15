#!/usr/bin/env bash
# Boardify — avvio facile: chiude istanze stantie (porta 1420 occupata),
# poi lancia il dev server. Uso: npm run app
set -u
cd "$(dirname "$0")/.."

pkill -f "src-tauri/target/debug/boardify" 2>/dev/null
# vite orfano sulla 1420 del progetto (non toccare altri progetti)
if ss -tln 2>/dev/null | grep -q ":1420 "; then
  pkill -f "boardify/node_modules/.bin/vite" 2>/dev/null
  sleep 1
fi

exec npm run tauri dev
