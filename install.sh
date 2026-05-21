#!/usr/bin/env bash
set -euo pipefail

# bitPOS — Self-Hosted Lightning POS + Bolt Card Wallet
# One-line install: curl -sSL https://bitpos.app/install.sh | bash

REPO_URL="https://raw.githubusercontent.com/satosys-tech/bitpos-core/main"
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"

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
for cmd in docker curl; do
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

echo "  📥 Downloading docker-compose.yml..."
curl -sSL "$REPO_URL/$COMPOSE_FILE" -o "$COMPOSE_FILE"

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
cat > "$ENV_FILE" <<EOF
NWC_URL=${NWC_URL}
DOMAIN=${DOMAIN}
SESSION_SECRET=${SESSION_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
EOF

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
echo "    View logs:    docker compose -f $INSTALL_DIR/$COMPOSE_FILE logs -f"
echo "    Stop:         docker compose -f $INSTALL_DIR/$COMPOSE_FILE down"
echo "    Update:       docker compose -f $INSTALL_DIR/$COMPOSE_FILE pull && docker compose -f $INSTALL_DIR/$COMPOSE_FILE up -d"
echo ""
