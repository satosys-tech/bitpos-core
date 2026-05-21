# bitPOS - Self-Hosted Lightning POS + Bolt Card Wallet

The open-source, single-user edition of [bitPOS](https://bitpos.app). Run your own Lightning point-of-sale terminal and Bolt Card issuing wallet in one Docker container.

## Quick Start

```bash
curl -sSL https://bitpos.app/install.sh | bash
```

That's it. The installer will ask for your NWC connection string and your domain, then launch everything with Docker Compose.

Or, for a manual one-liner:

```bash
docker run -d \
  -e NWC_URL="nostr+walletconnect://..." \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e DOMAIN="localhost:3000" \
  -p 3000:3000 \
  ghcr.io/bitpos/bitpos:latest
```

Then open [http://localhost:3000](http://localhost:3000) and complete the 30-second setup wizard.

---

## Prerequisites

- **Docker** 24+ with the Compose plugin (`docker compose` — note: not `docker-compose`)
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

1. Choose a Lightning handle (becomes `handle@yourdomain` for receiving payments)
2. Set a 4-digit PIN - this is the only credential you'll use to unlock the app
3. Done - your wallet is ready

The PIN is bcrypt-hashed in the database. There is no password reset - if you lose your PIN, reset the database and run setup again.

---

## Card Shop

The **Card Shop** lets you order physical NFC Bolt Cards directly from your bitPOS instance. Orders are fulfilled by bitpos.app:

- Browse designs and get a shipping quote
- Enter your shipping address - **this is sent to bitpos.app** for fulfillment
- You receive tracking updates in the Orders section

Bolt Cards arrived: scan the QR code in the **Bolt Card** tab of your app to program your card in seconds.

---

## docker-compose.yml Reference

```yaml
services:
  bitpos:
    image: ghcr.io/bitpos/bitpos:latest
    ports:
      - "3000:3000"
    environment:
      NWC_URL: "nostr+walletconnect://..."   # Required
      SESSION_SECRET: "random-hex-string"     # Required — run: openssl rand -hex 32
      DOMAIN: "pos.myshop.com"               # Required for LNURL + card provisioning
      ENCRYPTION_KEY: ""                      # Recommended — run: openssl rand -hex 16
      DATABASE_URL: "postgresql://..."        # Required (provided by db service below)
      SHOP_API_URL: "https://bitpos.app/api/shop"  # Optional override
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
| `SESSION_SECRET` | ✅ | - | Random string for JWT signing (`openssl rand -hex 32`) |
| `DOMAIN` | ✅ | - | Your public hostname (used in LNURL callbacks and card URLs) |
| `DATABASE_URL` | ✅ | - | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Recommended | random | 32-char hex for AES card key encryption at rest |
| `PORT` | ❌ | `3000` | HTTP port the server listens on |
| `SHOP_API_URL` | ❌ | `https://bitpos.app/api/shop` | Fulfillment API base URL |
| `SHOP_INSTANCE_SECRET` | ❌ | built-in | HMAC secret for shop proxy authentication |

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
node dist/index.js
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
└── Dockerfile     Multi-stage build
```

The Docker image builds both, then runs a single `node` process that serves the API at `/api/*` and the PWA at everything else.

---

## Contributing

- **Bugs & feature requests**: [GitHub Issues](https://github.com/bitpos/bitpos/issues)
- **Discussion**: [GitHub Discussions](https://github.com/bitpos/bitpos/discussions)
- **Nostr**: npub... (follow for updates)

Pull requests welcome! Please open an issue or discussion before large changes.

---

## License

MIT - see [LICENSE](LICENSE)

The hosted bitpos.app service is separate and is based on this open-source repository.
