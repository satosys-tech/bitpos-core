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

exec node /app/server/dist/index.mjs
