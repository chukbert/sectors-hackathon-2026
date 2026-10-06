#!/usr/bin/env bash
# Deploy demo publik ke VPS: kirim working tree → docker compose (PUBLIC_DEMO=1, Store offline, 0 kredit Sectors).
#   tools/deploy.sh                        # default: root@76.13.192.167, port lokal 3310
#   HOST=user@host WEB_PORT=3310 tools/deploy.sh
# Reverse proxy + TLS untuk domain diatur terpisah di server (lihat output akhir).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${HOST:-root@76.13.192.167}"
KEY="${KEY:-$HOME/.ssh/id_sectors_deploy}"
DIR="${DIR:-/opt/struk-jadi-saham}"
WEB_PORT="${WEB_PORT:-3310}"
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$HOST")

cd "$ROOT"
echo "→ kirim kode ke $HOST:$DIR"
tar --exclude=.git --exclude=.venv --exclude=.data --exclude=.logs --exclude=node_modules --exclude=.next \
    --exclude=__pycache__ --exclude=.pytest_cache --exclude=.env --exclude='*.tsbuildinfo' -czf - . \
  | "${SSH[@]}" "mkdir -p $DIR && tar -xzf - -C $DIR"

# Hanya variabel yang dibutuhkan demo yang dikirim; key tidak pernah dicetak.
if [ -f .env ]; then
  grep -E '^(OPENROUTER_API_KEY|OPENROUTER_BASE_URL|IDXMACA_MODEL)=' .env | sed 's/[[:space:]]*#.*$//' > /tmp/struk-demo.env || true
else
  : > /tmp/struk-demo.env
fi
cat >> /tmp/struk-demo.env <<EOF
IDXMACA_STORE_MODE=offline
PUBLIC_DEMO=1
WEB_BIND=127.0.0.1:$WEB_PORT
STRUK_QUOTA_DAILY_LLM=600
EOF
"${SSH[@]}" "cat > $DIR/.env && chmod 600 $DIR/.env" < /tmp/struk-demo.env
rm -f /tmp/struk-demo.env

echo "→ build & jalankan"
"${SSH[@]}" "cd $DIR && docker compose up -d --build --remove-orphans && docker compose ps"
"${SSH[@]}" "for i in \$(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:$WEB_PORT/ && break; sleep 2; done; \
  curl -s http://127.0.0.1:$WEB_PORT/api/core/v1/struk/status | head -c 200; echo"
echo "✓ app di 127.0.0.1:$WEB_PORT pada server — arahkan reverse proxy domain ke sana."
