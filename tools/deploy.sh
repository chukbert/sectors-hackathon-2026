#!/usr/bin/env bash
# Deploy demo publik ke VPS. Aturan: build berat dikerjakan di laptop, bukan di VPS (1 vCPU).
#   1. Web di-build di laptop (container Linux lokal) → .deploy/web (server Next standalone + aset).
#   2. Paket kode + hasil build dikirim per potongan dengan ulang-coba (jalur ke VPS kadang memutus transfer besar).
#   3. VPS hanya merakit image dari hasil jadi: web = COPY, core/store = COPY kode (layer pip ter-cache).
#   tools/deploy.sh                        # default: root@76.13.192.167, port lokal 3310
#   HOST=user@host WEB_PORT=3310 tools/deploy.sh
#   SKIP_BUILD=1 tools/deploy.sh           # pakai .deploy/web yang sudah ada
# Reverse proxy + TLS untuk domain diatur terpisah di server.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${HOST:-root@76.13.192.167}"
KEY="${KEY:-$HOME/.ssh/id_sectors_deploy}"
DIR="${DIR:-/opt/struk-jadi-saham}"
WEB_PORT="${WEB_PORT:-3310}"
CHUNK="${CHUNK:-256k}"
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=10 -o ServerAliveCountMax=3 "$HOST")
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml"

cd "$ROOT"
WORK="$ROOT/.deploy/tmp"
rm -rf "$WORK" && mkdir -p "$WORK"

retry() { # retry <n> <cmd...>
  local n=$1 i; shift
  for i in $(seq 1 "$n"); do "$@" && return 0; echo "  … gagal (percobaan $i/$n), ulang" >&2; sleep 5; done
  return 1
}

if [ "${SKIP_BUILD:-0}" != 1 ]; then
  echo "→ build web di laptop (npm install + next build di container Linux lokal)"
  rm -rf .deploy/web
  docker build -q -f apps/web/Dockerfile --target artifact --output type=local,dest=.deploy/web . >/dev/null
fi
[ -f .deploy/web/server.js ] || { echo "✗ .deploy/web/server.js tidak ada"; exit 1; }

echo "→ paket kode + hasil build"
tar --exclude=.git --exclude=.venv --exclude=.data --exclude=.logs --exclude=node_modules --exclude=.next \
    --exclude=__pycache__ --exclude=.pytest_cache --exclude=.env --exclude='*.tsbuildinfo' \
    --exclude=./docs --exclude=./.deploy --exclude=./apps/web \
    -cf "$WORK/pkg.tar" .
tar -rf "$WORK/pkg.tar" apps/web/Dockerfile.prebuilt .deploy/web
xz -T0 -6 "$WORK/pkg.tar"
PKG="$WORK/pkg.tar.xz"
SUM=$(sha256sum "$PKG" | cut -d' ' -f1)
( cd "$WORK" && split -b "$CHUNK" -d -a 3 pkg.tar.xz part_ )
N=$(ls "$WORK"/part_* | wc -l)
echo "  $(du -h "$PKG" | cut -f1) dalam $N potongan · sha256 ${SUM:0:12}…"

echo "→ kirim ke $HOST (potongan yang sudah sampai dilewati)"
retry 6 "${SSH[@]}" "mkdir -p /tmp/paham-deploy"
for p in "$WORK"/part_*; do
  name=$(basename "$p"); size=$(wc -c < "$p")
  send() {
    local got
    got=$(timeout 120 "${SSH[@]}" "f=/tmp/paham-deploy/$name; if [ -f \$f ] && [ \"\$(wc -c < \$f)\" = $size ]; then echo $size; else cat > \$f.part && mv \$f.part \$f && wc -c < \$f; fi" < "$p" | tr -d '[:space:]')
    [ "$got" = "$size" ]
  }
  retry 8 send || { echo "✗ gagal mengirim $name — jalankan ulang; potongan yang sudah sampai tidak dikirim lagi"; exit 1; }
  printf '.'
done
echo

echo "→ rakit di server + cek checksum"
retry 4 "${SSH[@]}" "cd /tmp/paham-deploy && cat part_* > pkg.tar.xz && echo \"$SUM  pkg.tar.xz\" | sha256sum -c --quiet"

# Hanya variabel demo; Paham Emiten tidak memakai LLM, jadi tidak ada key yang dikirim.
printf 'IDXMACA_STORE_MODE=offline\nWEB_BIND=127.0.0.1:%s\n' "$WEB_PORT" > "$WORK/demo.env"
retry 4 "${SSH[@]}" "cat > /tmp/paham-deploy/demo.env" < "$WORK/demo.env"

echo "→ pasang + jalankan (VPS hanya menyalin hasil build)"
# Satu sesi pendek; hasilnya ditulis ke log di server supaya tetap jalan walau SSH putus.
retry 3 "${SSH[@]}" "cd $DIR 2>/dev/null || mkdir -p $DIR; cd $DIR && rm -rf apps fixtures tools .deploy && \
  tar -xJf /tmp/paham-deploy/pkg.tar.xz -C $DIR && mv /tmp/paham-deploy/demo.env $DIR/.env && chmod 600 $DIR/.env && \
  nohup sh -c '$COMPOSE up -d --build --remove-orphans > /tmp/paham-deploy/up.log 2>&1; echo EXIT=\$? >> /tmp/paham-deploy/up.log' >/dev/null 2>&1 &"

echo "→ tunggu container sehat"
for i in $(seq 1 60); do
  out=$(timeout 30 "${SSH[@]}" "tail -1 /tmp/paham-deploy/up.log 2>/dev/null" 2>/dev/null || true)
  case "$out" in EXIT=0) break ;; EXIT=*) echo "✗ compose gagal:"; "${SSH[@]}" "tail -30 /tmp/paham-deploy/up.log"; exit 1 ;; esac
  sleep 5
done
retry 4 "${SSH[@]}" "cd $DIR && $COMPOSE ps --format '{{.Service}} {{.Status}}'; \
  for i in \$(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:$WEB_PORT/ && break; sleep 2; done; \
  curl -s http://127.0.0.1:$WEB_PORT/api/core/v1/struk/status | head -c 160; echo; rm -rf /tmp/paham-deploy"
rm -rf "$WORK"
echo "✓ app di 127.0.0.1:$WEB_PORT pada server — reverse proxy domain mengarah ke sana."
