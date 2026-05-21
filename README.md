# bitPOS - Self-Hosted Lightning POS + Bolt Card Wallet

The open-source, single-user edition of [bitPOS](https://bitpos.app). Run your own Lightning point-of-sale terminal and Bolt Card issuing wallet in one Docker container.

## Quick Start

```bash
curl -sSL https://bitpos.app/install.sh | bash
```

That's it. The installer will ask for your NWC connection string and your domain, then launch everything with Docker Compose.

Or, for a manual one-liner (embedded Postgres included):

```bash
docker run -d \
  -e NWC_URL="nostr+walletconnect://..." \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e DOMAIN="localhost:3000" \
  -p 3000:3000 \
  ghcr.io/satosys-tech/bitpos-core:latest
```

Then open [http://localhost:3000](http://localhost:3000) and complete the 30-second setup wizard.

---

## Prerequisites

- **Docker** 24+ with the Compose plugin (`docker compose` - note: not `docker-compose`)
- **An NWC-compatible wallet** - [Alby Hub](https://getalby.com/alby-hub) is recommended (self-hosted or cloud). Any wallet that supports the [Nostr Wallet Connect](https://nwc.dev) protocol works.
- A domain pointing to your server (optional for local use)

---

## NWC Setup

1. Create an [Alby Hub](https://getalby.com/alby-hub) account.
2. Go to **Apps** → **Add App** → choose "Custom permissions"
3. Grant: **Pay Invoice**, **Make Invoice**, **Lookup Invoice**
4. Copy the `nostr+walletconnect://...` connection string
5. Paste it when the installer asks for `NWC_URL`

> Your NWC string is a secret. It is stored only in `.env` on your server and passed as an environment variable - it never appears in the UI.

---

## PIN Setup (First Boot)

When you first open bitPOS in your browser, you'll see the **Setup Wizard**:

1. bitPOS verifies your NWC wallet is reachable and shows your balance
2. Choose a Lightning handle (becomes `handle@yourdomain` for receiving payments)
3. Set a 4-digit PIN - this is the only credential you'll use to unlock the app
4. Done - your wallet is ready

The PIN is bcrypt-hashed in the database. There is no password reset - if you lose your PIN, reset the database and run setup again.

---

## Card Shop

The **Card Shop** lets you order physical NFC Bolt Cards directly from your bitPOS instance. Orders are fulfilled by bitpos.app:

- Browse designs and get a shipping quote
- Enter your shipping address - **this is sent to bitpos.app** for fulfillment
- Card orders are sent to bitpos.app
- You receive tracking updates in the Orders section

Bolt Cards arrived: scan the QR code in the **Bolt Card** tab of your app to program your card in seconds.

---

## docker-compose.yml Reference

```yaml
services:
  bitpos:
    image: ghcr.io/satosys-tech/bitpos-core:latest
    ports:
      - "3000:3000"
    environment:
      NWC_URL: "nostr+walletconnect://..."   # Required
      SESSION_SECRET: "random-hex-string"     # Required - run: openssl rand -hex 32
      DOMAIN: "pos.myshop.com"               # Required for LNURL + card provisioning
      ENCRYPTION_KEY: ""                      # Recommended - run: openssl rand -hex 16
      DATABASE_URL: "postgresql://..."        # Required (provided by db service below)
      SHOP_API_URL: "https://bitpos.app/api/shop"  # Optional override
      SHOP_INSTANCE_SECRET: "your-secret"    # Set to a unique secret per deployment
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    volumes:
      - bitpos-db:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: bitpos
      POSTGRES_USER: bitpos
      POSTGRES_PASSWORD: bitpos

volumes:
  bitpos-db:
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NWC_URL` | ✅ | - | Nostr Wallet Connect string from your Lightning wallet |
| `SESSION_SECRET` | ✅ | random (insecure) | Random string for JWT signing (`openssl rand -hex 32`) |
| `DOMAIN` | ✅ | - | Your public hostname (used in LNURL callbacks and card URLs) |
| `DATABASE_URL` | ✅ | embedded Postgres | PostgreSQL connection string (docker run uses built-in Postgres) |
| `ENCRYPTION_KEY` | Recommended | random | 32-char hex for AES card key encryption at rest |
| `PORT` | ❌ | `3000` | HTTP port the server listens on |
| `SHOP_API_URL` | ❌ | `https://bitpos.app/api/shop` | Fulfillment API base URL |
| `SHOP_INSTANCE_SECRET` | Recommended | random (per start) | HMAC secret for shop proxy authentication - set a stable value |

> **Important:** `SESSION_SECRET` and `SHOP_INSTANCE_SECRET` default to random values when not set. This means sessions and shop signatures are invalidated on every restart. Always set these in production.

---

## Updating

```bash
cd ~/bitpos
docker compose pull
docker compose up -d
```

---

## Self-Hosting FAQ

**Can I use a different Lightning wallet?**  
Yes, any NWC-compatible wallet works. Alby Hub is recommended because it supports all required methods (pay_invoice, make_invoice, lookup_invoice).

**Is my data private?**  
All transaction and balance data lives in your local Postgres database. The only data sent externally is shop orders (shipping address + payment) to bitpos.app for fulfillment.

**What happens if I lose my PIN?**  
Delete the database volume and run setup again. Your wallet funds are safe - they live in your connected Lightning wallet (NWC), not in bitPOS.

**Can I run this without Docker?**  
Yes. Set `DATABASE_URL` and `NWC_URL` in your environment and run:
```bash
cd server && npm install && npm run build
node dist/index.mjs
```
The web build must be placed in `../public/` relative to `server/`.

**What is the LNURL address?**  
When `DOMAIN` is set correctly, your Lightning address is `handle@yourdomain`. Anyone can send sats to this address - they land directly in your connected wallet.

---

## Architecture

```
bitPOS OSS
├── server/        Express + TypeScript API
│   ├── src/db/    Drizzle schema (Postgres)
│   ├── src/lib/   NWC, boltcard, payment, shopProxy, ...
│   └── src/routes/
├── web/           React + Vite PWA (served statically)
└── Dockerfile     Multi-stage build (embeds Postgres for docker run mode)
```

The Docker image builds both, then runs a single process that serves the API at `/api/*` and the PWA at everything else. When `DATABASE_URL` is not set, an embedded Postgres instance is started automatically.

---

## Contributing

- **Bugs & feature requests**: [GitHub Issues](https://github.com/satosys-tech/bitpos-core/issues)
- **Discussion**: [GitHub Discussions](https://github.com/satosys-tech/bitpos-core/discussions)
- **Nostr**: npub... (follow for updates)

Pull requests welcome! Please open an issue or discussion before large changes.

---

## License

MIT - see [LICENSE](LICENSE)

The hosted bitpos.app service (fulfillment, card shop, hosted accounts) runs on this Core. This repository is the self-hosted open-source edition.
