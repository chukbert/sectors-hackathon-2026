#!/usr/bin/env bash
# Start Store (8787) + Core (8788) untuk dev lokal.  Usage: tools/serve.sh [stop]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY="${PY:-$ROOT/.venv/bin/python}"
mkdir -p .data .logs
# Muat .env bila ada (key tidak pernah dicetak)
if [ -f "$ROOT/.env" ]; then set -a; . "$ROOT/.env"; set +a; fi


stop() {
  for f in .data/store.pid .data/core.pid; do
    if [ -f "$f" ]; then kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; fi
  done
  for i in $(seq 1 40); do
    if ! curl -sf --max-time 1 http://127.0.0.1:8787/v1/health > /dev/null 2>&1 && \
       ! curl -sf --max-time 1 http://127.0.0.1:8788/v1/health > /dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
  echo "stopped"
}

if [ "${1:-}" = "stop" ]; then stop; exit 0; fi

"$PY" -m uvicorn app.main:app --host 127.0.0.1 --port 8787 --app-dir apps/store > .logs/store.log 2>&1 &
echo $! > .data/store.pid
"$PY" -m uvicorn app.main:app --host 127.0.0.1 --port 8788 --app-dir apps/core > .logs/core.log 2>&1 &
echo $! > .data/core.pid

for i in $(seq 1 30); do
  if curl -sf --max-time 2 http://127.0.0.1:8787/v1/health > /dev/null && curl -sf --max-time 2 http://127.0.0.1:8788/v1/health > /dev/null; then
    echo "store:  http://127.0.0.1:8787 (pid $(cat .data/store.pid))"
    echo "core:   http://127.0.0.1:8788 (pid $(cat .data/core.pid))"
    exit 0
  fi
  sleep 0.5
done
echo "services gagal start — cek .logs/" >&2
exit 1