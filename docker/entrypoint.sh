#!/bin/sh
set -e

# ── Embedded Postgres (single-container mode) ─────────────────────────────────
# When DATABASE_URL is not provided, start a local Postgres instance so that
# `docker run -e NWC_URL=... -p 3000:3000 ghcr.io/satosys-tech/bitpos-core`
# works out of the box without any extra services.
#
# When DATABASE_URL IS provided (e.g. via docker-compose), we skip this entirely
# and connect straight to the external DB.

if [ -z "$DATABASE_URL" ]; then
  PGDATA="${PGDATA:-/data/postgres}"
  PGUSER="bitpos"
  PGDB="bitpos"
  PGPASSWORD="${PGPASSWORD:-bitpos}"
  PGPORT="${PGPORT:-5432}"

  export DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@localhost:${PGPORT}/${PGDB}"

  if [ ! -f "${PGDATA}/PG_VERSION" ]; then
    echo "[bitpos] Initializing embedded Postgres in ${PGDATA}..."
    mkdir -p "${PGDATA}"
    chown -R postgres:postgres "${PGDATA}"
    su-exec postgres initdb \
      --pgdata="${PGDATA}" \
      --username="${PGUSER}" \
      --auth-local=trust \
      --auth-host=md5 \
      --no-instructions \
      -E UTF8 \
      --locale=C >/dev/null 2>&1
    echo "listen_addresses='localhost'" >> "${PGDATA}/postgresql.conf"
  fi

  echo "[bitpos] Starting embedded Postgres..."
  su-exec postgres pg_ctl start \
    -D "${PGDATA}" \
    -l "${PGDATA}/postgres.log" \
    -o "-p ${PGPORT}" \
    -w \
    --timeout=30 >/dev/null 2>&1

  # Create DB and user if first boot
  su-exec postgres psql -p "${PGPORT}" -U "${PGUSER}" -c "\q" 2>/dev/null || \
    su-exec postgres createdb -p "${PGPORT}" -U "${PGUSER}" "${PGDB}" 2>/dev/null || true

  echo "[bitpos] Embedded Postgres ready at ${DATABASE_URL}"
else
  echo "[bitpos] Using external database: ${DATABASE_URL%%@*}@..."
fi

# ── Cloudflare Tunnel ─────────────────────────────────────────────────────────
# Three modes (checked in order of priority):
#
#  1. CLOUDFLARE_TUNNEL_TOKEN is set (named tunnel)
#     Stable URL on your own domain. Requires DOMAIN to also be set.
#     Set both in .env:
#       CLOUDFLARE_TUNNEL_TOKEN=eyJ...
#       DOMAIN=pay.myshop.com
#
#  2. DOMAIN is set without a token (manual mode)
#     You manage your own routing (VPS + Caddy, Nginx, etc.).
#     cloudflared is skipped entirely.
#
#  3. Nothing set (quick tunnel, default)
#     cloudflared generates a random trycloudflare.com URL at startup.
#     No account or token required. URL changes every restart - good for
#     testing, not for an LN address you share with others.

_SERVER_PORT="${PORT:-3000}"

if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  if [ -z "${DOMAIN:-}" ]; then
    echo "[bitpos] ERROR: CLOUDFLARE_TUNNEL_TOKEN is set but DOMAIN is not."
    echo "[bitpos]        Set DOMAIN=your-tunnel-hostname.example.com alongside"
    echo "[bitpos]        CLOUDFLARE_TUNNEL_TOKEN in your .env file."
    exit 1
  fi
  echo "[bitpos] Named tunnel mode - domain: ${DOMAIN}"
  export TUNNEL_MODE="named"
  cloudflared tunnel --no-autoupdate run --token "${CLOUDFLARE_TUNNEL_TOKEN}" &

elif [ -n "${DOMAIN:-}" ] && case "${DOMAIN}" in localhost|localhost:*) false ;; *) true ;; esac; then
  echo "[bitpos] Manual domain mode - domain: ${DOMAIN}"
  export TUNNEL_MODE="manual"

else
  echo "[bitpos] No DOMAIN set - starting Cloudflare quick tunnel..."
  echo "[bitpos] (URL changes each restart - set CLOUDFLARE_TUNNEL_TOKEN + DOMAIN for a stable address)"
  export TUNNEL_MODE="quick"

  CF_LOG="/tmp/cf-tunnel.log"
  cloudflared tunnel --no-autoupdate --url "http://localhost:${_SERVER_PORT}" >"${CF_LOG}" 2>&1 &

  echo "[bitpos] Waiting for tunnel URL (up to 30s)..."
  CF_URL=""
  i=0
  while [ $i -lt 30 ]; do
    CF_URL=$(grep -o 'https://[^[:space:]]*\.trycloudflare\.com' "${CF_LOG}" 2>/dev/null | head -1)
    [ -n "$CF_URL" ] && break
    sleep 1
    i=$((i + 1))
  done

  if [ -z "$CF_URL" ]; then
    echo "[bitpos] WARNING: Timed out waiting for quick tunnel URL."
    echo "[bitpos]          Check cloudflared logs: /tmp/cf-tunnel.log"
    echo "[bitpos]          Falling back to localhost:${_SERVER_PORT}"
    export DOMAIN="localhost:${_SERVER_PORT}"
    export TUNNEL_MODE="manual"
  else
    export DOMAIN="${CF_URL#https://}"
    echo "[bitpos]"
    echo "[bitpos]  Public URL:        ${CF_URL}"
    echo "[bitpos]  Lightning address: handle@${DOMAIN}"
    echo "[bitpos]"
    echo "[bitpos]  NOTE: This URL changes every restart."
    echo "[bitpos]  For a permanent address, see README - Named Tunnel setup."
    echo "[bitpos]"
  fi
fi

exec node /app/server/dist/index.mjs
