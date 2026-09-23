#!/usr/bin/env bash
# Web Next.js: tools/web.sh [start|dev|stop|build]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/.data" "$ROOT/.logs"
# Muat .env bila ada (key tidak pernah dicetak)
if [ -f "$ROOT/.env" ]; then set -a; . "$ROOT/.env"; set +a; fi

PIDFILE="$ROOT/.data/web.pid"

stop() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
  fi
  if command -v fuser > /dev/null 2>&1; then
    fuser -k 3000/tcp > /dev/null 2>&1 || true
  fi
  echo "web stopped"
}

case "${1:-start}" in
  stop) stop; exit 0 ;;
  build) cd "$ROOT/apps/web" && npm run build; exit 0 ;;
  dev) cd "$ROOT/apps/web" && nohup npm run dev > "$ROOT/.logs/web.log" 2>&1 & echo $! > "$PIDFILE" ;;
  start)
    cd "$ROOT/apps/web"
    if [ ! -d .next ]; then npm run build; fi
    nohup npm run start > "$ROOT/.logs/web.log" 2>&1 &
    echo $! > "$PIDFILE"
    ;;
  *) echo "usage: tools/web.sh [start|dev|stop|build]" >&2; exit 1 ;;
esac

for i in $(seq 1 60); do
  if curl -sf --max-time 2 http://127.0.0.1:3000/ > /dev/null; then
    echo "web: http://127.0.0.1:3000 (pid $(cat "$PIDFILE"))"
    exit 0
  fi
  sleep 0.5
done
echo "web gagal start — cek .logs/web.log" >&2
exit 1