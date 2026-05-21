#!/usr/bin/env bash
set -euo pipefail

# bitPOS — Self-Hosted Lightning POS + Bolt Card Wallet
# One-line install: curl -sSL https://bitpos.app/install.sh | bash

echo ""
echo "  ██████╗ ██╗████████╗██████╗  ██████╗ ███████╗"
echo "  ██╔══██╗██║╚══██╔══╝██╔══██╗██╔═══██╗██╔════╝"
echo "  ██████╔╝██║   ██║   ██████╔╝██║   ██║███████╗"
echo "  ██╔══██╗██║   ██║   ██╔═══╝ ██║   ██║╚════██║"
echo "  ██████╔╝██║   ██║   ██║     ╚██████╔╝███████║"
echo "  ╚═════╝ ╚═╝   ╚═╝   ╚═╝      ╚═════╝ ╚══════╝"
echo ""
echo "  Self-Hosted Lightning POS + Bolt Card Wallet"
echo "  ──────────────────────────────────────────────"
echo ""

# Check dependencies
for cmd in docker; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "  ❌ '$cmd' is required but not installed. Please install it and re-run."
    exit 1
  fi
done

if ! docker compose version &>/dev/null 2>&1; then
  echo "  ❌ 'docker compose' (v2) is required. Please update Docker Desktop or install the compose plugin."
  exit 1
fi

# Create install dir
INSTALL_DIR="$HOME/bitpos"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Prompt for NWC_URL if not set
if [ -z "${NWC_URL:-}" ]; then
  echo ""
  echo "  🔌 Enter your NWC connection string (nostr+walletconnect://...):"
  echo "     Get one free from https://getalby.com"
  echo ""
  read -r -p "  NWC_URL: " NWC_URL
fi

if [ -z "${DOMAIN:-}" ]; then
  echo ""
  echo "  🌐 Enter your public domain (e.g. pos.myshop.com) or press Enter for localhost:3000:"
  read -r -p "  DOMAIN: " DOMAIN
  DOMAIN="${DOMAIN:-localhost:3000}"
fi

# Generate secrets
SESSION_SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)"
ENCRYPTION_KEY="$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | xxd -p)"

# Write .env
# SHOP_INSTANCE_SECRET is intentionally omitted — the stable shared secret
# is baked into the Docker image and verified by bitpos.app automatically.
cat > .env <<ENVEOF
NWC_URL=${NWC_URL}
DOMAIN=${DOMAIN}
SESSION_SECRET=${SESSION_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ENVEOF

# Write docker-compose.yml (self-contained, no external fetch needed)
cat > docker-compose.yml <<'COMPOSEEOF'
version: "3.9"

services:
  bitpos:
    image: ghcr.io/satosys-tech/bitpos-core:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NWC_URL: "${NWC_URL}"
      SESSION_SECRET: "${SESSION_SECRET:-change-me-in-production}"
      DOMAIN: "${DOMAIN:-localhost:3000}"
      ENCRYPTION_KEY: "${ENCRYPTION_KEY:-}"
      SHOP_API_URL: "${SHOP_API_URL:-https://bitpos.app/api/shop}"
      SHOP_INSTANCE_SECRET: "${SHOP_INSTANCE_SECRET:-}"
      DATABASE_URL: "postgresql://bitpos:bitpos@db:5432/bitpos"
      NODE_ENV: "production"
    depends_on:
      db:
        condition: service_healthy
    networks:
      - bitpos-network

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: bitpos
      POSTGRES_USER: bitpos
      POSTGRES_PASSWORD: bitpos
    volumes:
      - bitpos-db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bitpos -d bitpos"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - bitpos-network

volumes:
  bitpos-db:
    driver: local

networks:
  bitpos-network:
    driver: bridge
COMPOSEEOF

echo ""
echo "  ✅ Configuration saved to $INSTALL_DIR/.env"
echo ""
echo "  🚀 Starting bitPOS..."
docker compose pull
docker compose up -d

echo ""
echo "  ✅ bitPOS is running!"
echo ""
echo "  Open: http://${DOMAIN}"
echo ""
echo "  You'll be guided through first-boot setup in your browser."
echo ""
echo "  Useful commands:"
echo "    View logs:    docker compose -f $INSTALL_DIR/docker-compose.yml logs -f"
echo "    Stop:         docker compose -f $INSTALL_DIR/docker-compose.yml down"
echo "    Update:       docker compose -f $INSTALL_DIR/docker-compose.yml pull && docker compose -f $INSTALL_DIR/docker-compose.yml up -d"
echo ""
