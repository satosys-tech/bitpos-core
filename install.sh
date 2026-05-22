#!/usr/bin/env bash
set -euo pipefail

# bitPOS - Self-Hosted Lightning POS + Bolt Card Wallet
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

# ── NWC wallet ────────────────────────────────────────────────────────────────
if [ -z "${NWC_URL:-}" ]; then
  echo ""
  echo "  🔌 NWC connection string (optional — you can also paste it in the"
  echo "     setup wizard after start). Press Enter to skip."
  echo "     Get one free from https://getalby.com"
  echo ""
  read -r -p "  NWC_URL [empty to skip]: " NWC_URL
fi

# ── Public URL / tunnel setup ─────────────────────────────────────────────────
echo ""
echo "  🌐 How do you want to get a public URL?"
echo "     bitPOS needs a public HTTPS URL for Lightning addresses and card provisioning."
echo ""
echo "     1) Quick tunnel  — No setup. Cloudflare generates a free HTTPS URL"
echo "                        automatically. URL changes each restart. Good for testing."
echo ""
echo "     2) Named tunnel  — Free Cloudflare account + your own domain. Stable URL"
echo "                        that persists across restarts. Recommended for real use."
echo ""
echo "     3) Manual domain — You already have a VPS/Caddy/Nginx setup."
echo "                        Just enter your hostname."
echo ""
read -r -p "  Choice [1/2/3, default 1]: " TUNNEL_CHOICE
TUNNEL_CHOICE="${TUNNEL_CHOICE:-1}"

CLOUDFLARE_TUNNEL_TOKEN=""
DOMAIN=""

case "$TUNNEL_CHOICE" in
  2)
    echo ""
    echo "  Named tunnel setup:"
    echo "    1. Go to https://one.dash.cloudflare.com -> Zero Trust -> Networks -> Tunnels"
    echo "    2. Create a tunnel, copy the token"
    echo "    3. Add a Public Hostname pointing at http://localhost:3000"
    echo "    4. Paste the token and your hostname below"
    echo ""
    read -r -p "  CLOUDFLARE_TUNNEL_TOKEN: " CLOUDFLARE_TUNNEL_TOKEN
    read -r -p "  DOMAIN (e.g. pay.myshop.com): " DOMAIN
    if [ -z "$CLOUDFLARE_TUNNEL_TOKEN" ] || [ -z "$DOMAIN" ]; then
      echo "  ❌ Both token and domain are required for named tunnel mode."
      exit 1
    fi
    echo "  ✅ Named tunnel configured - domain: ${DOMAIN}"
    ;;
  3)
    echo ""
    read -r -p "  DOMAIN (e.g. pay.myshop.com): " DOMAIN
    if [ -z "$DOMAIN" ]; then
      echo "  ❌ Domain is required for manual mode."
      exit 1
    fi
    echo "  ✅ Manual domain: ${DOMAIN}"
    ;;
  *)
    echo "  ✅ Quick tunnel mode - a public URL will be generated on first start."
    ;;
esac

# Generate secrets
SESSION_SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)"
ENCRYPTION_KEY="$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | xxd -p)"

# Write .env
cat > .env <<ENVEOF
NWC_URL=${NWC_URL:-}
DOMAIN=${DOMAIN:-}
CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN:-}
SESSION_SECRET=${SESSION_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ENVEOF

# Write docker-compose.yml (self-contained, no external fetch needed)
cat > docker-compose.yml <<'COMPOSEEOF'
services:
  bitpos:
    image: ghcr.io/satosys-tech/bitpos-core:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NWC_URL: "${NWC_URL:-}"
      SESSION_SECRET: "${SESSION_SECRET:-change-me-in-production}"
      DOMAIN: "${DOMAIN:-}"
      CLOUDFLARE_TUNNEL_TOKEN: "${CLOUDFLARE_TUNNEL_TOKEN:-}"
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
if [ -n "$DOMAIN" ]; then
  echo "  Open: https://${DOMAIN}"
  echo ""
  echo "  Your Lightning address will be: handle@${DOMAIN}"
else
  echo "  Open: http://localhost:3000"
  echo ""
  echo "  A public URL is being generated by Cloudflare quick tunnel."
  echo "  Check the logs to see your URL:"
  echo "    docker compose -f $INSTALL_DIR/docker-compose.yml logs -f bitpos"
  echo ""
  echo "  Look for a line like:"
  echo "    [bitpos]  Public URL: https://xxx.trycloudflare.com"
fi
echo ""
echo "  You'll be guided through first-boot setup in your browser."
echo ""
echo "  Useful commands:"
echo "    View logs:    docker compose -f $INSTALL_DIR/docker-compose.yml logs -f"
echo "    Stop:         docker compose -f $INSTALL_DIR/docker-compose.yml down"
echo "    Update:       docker compose -f $INSTALL_DIR/docker-compose.yml pull && docker compose -f $INSTALL_DIR/docker-compose.yml up -d"
echo ""
