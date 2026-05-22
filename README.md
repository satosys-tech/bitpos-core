# bitPOS - Self-Hosted Lightning POS + Bolt Card Wallet

The open-source, single-user edition of [bitPOS](https://bitpos.app). Run your own Lightning point-of-sale terminal and Bolt Card issuing wallet in one Docker container.

## Quick Start

```bash
curl -sSL https://bitpos.app/install.sh | bash
```

The installer walks you through NWC setup and public URL configuration, generates session/encryption secrets, and brings the stack up with Docker Compose.

Or, for a manual one-liner (embedded Postgres + auto quick tunnel):

```bash
docker run -d \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -p 3000:3000 \
  ghcr.io/satosys-tech/bitpos-core:latest
```

Then open [http://localhost:3000](http://localhost:3000) and complete the setup wizard. If no `DOMAIN` is set, a Cloudflare quick tunnel starts automatically — check the container logs for your public URL.

---

## Getting a Public URL

bitPOS needs a public HTTPS URL for two things:
- **Lightning addresses** — `handle@yourdomain` so wallets can pay you
- **Bolt Card provisioning** — the URL the Bolt Card Creator app fetches to program your card

The server handles this automatically via **Cloudflare Tunnel** (`cloudflared`), which is bundled in the Docker image. No port forwarding or VPS required — it works behind home NAT and CGNAT.

### Three modes

#### 1. Quick tunnel (default, zero config)

Leave `DOMAIN` and `CLOUDFLARE_TUNNEL_TOKEN` blank. On startup, the server generates a random `trycloudflare.com` HTTPS URL automatically.

```
[bitpos]  Public URL:        https://abc-def-123.trycloudflare.com
[bitpos]  Lightning address: handle@abc-def-123.trycloudflare.com
```

- No account or token needed
- URL changes every restart — not suitable for an LN address you share permanently
- Good for testing and evaluating the software

#### 2. Named tunnel (recommended for real use)

Set up a free Cloudflare account and point your own domain at the tunnel. The URL is stable across restarts — right for a real Lightning address.

**Setup steps:**

1. Create a free account at [cloudflare.com](https://cloudflare.com) and add your domain
2. Go to **Zero Trust** -> **Networks** -> **Tunnels** -> **Create a tunnel**
3. Choose "Cloudflared" as the connector type
4. Copy the tunnel token shown on the next screen
5. Under **Public Hostname**, add a hostname like `pay.myshop.com` pointing at `http://localhost:3000`
6. In your `.env`:

```env
CLOUDFLARE_TUNNEL_TOKEN=eyJ...your-token...
DOMAIN=pay.myshop.com
```

7. Restart: `docker compose up -d`

Your Lightning address will be: `handle@pay.myshop.com`

> You can use a free Cloudflare account with any domain you own (including cheap ones from Namecheap, Porkbun, etc.). Cloudflare just needs to be the DNS provider for your domain — point your domain's nameservers to Cloudflare's, then the tunnel handles everything else.

#### 3. Manual domain (VPS / Caddy / Nginx)

If you already have a server with a public IP and a reverse proxy, set `DOMAIN` directly and leave `CLOUDFLARE_TUNNEL_TOKEN` blank. cloudflared is skipped entirely.

```env
DOMAIN=pay.myshop.com
```

Your reverse proxy should forward HTTPS traffic on port 443 to port 3000 on the bitPOS container.

**Caddy example (`/etc/caddy/Caddyfile`):**
```
pay.myshop.com {
    reverse_proxy localhost:3000
}
```

---

## Prerequisites

- **Docker** 24+ with the Compose plugin (`docker compose` - note: not `docker-compose`)
- **An NWC-compatible wallet** - [Alby Hub](https://getalby.com/alby-hub) is recommended (self-hosted or cloud). Any wallet that supports the [Nostr Wallet Connect](https://nwc.dev) protocol works.
- A public URL for Lightning address support (handled automatically via Cloudflare Tunnel - see above)

---

## NWC Setup

1. Create an [Alby Hub](https://getalby.com/alby-hub) account.
2. Go to **Apps** -> **Add App** -> choose "Custom permissions"
3. Grant: **Pay Invoice**, **Make Invoice**, **Lookup Invoice**, **Get Balance**
4. Copy the `nostr+walletconnect://...` connection string
5. Paste it into the setup wizard at `http://localhost:3000` (or supply it as `NWC_URL` to the installer)

> Your NWC string is a secret. The wizard verifies it works before saving it to the database. To rotate it, run a setup reset from the login screen ("Forgot PIN? Reset this device") or set `NWC_URL` in your environment and restart — env always overrides DB.

---

## PIN Setup (First Boot)

When you first open bitPOS in your browser, you'll see the **Setup Wizard**:

1. bitPOS shows your current public URL and tunnel mode
2. Connect your NWC wallet (paste the connection string and test it)
3. Choose a Lightning handle (becomes `handle@yourdomain` for receiving payments)
4. Set a 4-digit PIN - this is the only credential you'll use to unlock the app
5. Done - your wallet is ready

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
      # Public URL - pick one mode (see README - Getting a Public URL):
      CLOUDFLARE_TUNNEL_TOKEN: ""   # Named tunnel token (set with DOMAIN)
      DOMAIN: ""                    # Your hostname, or leave blank for quick tunnel

      NWC_URL: "nostr+walletconnect://..."   # Optional (can be set in wizard)
      SESSION_SECRET: "random-hex-string"     # Required - run: openssl rand -hex 32
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
| `DOMAIN` | See note | auto (quick tunnel) | Your public hostname. Leave blank for quick tunnel, set alongside `CLOUDFLARE_TUNNEL_TOKEN` for named tunnel, or set alone for manual mode. |
| `CLOUDFLARE_TUNNEL_TOKEN` | No | - | Cloudflare named tunnel token. Requires `DOMAIN` to also be set. |
| `NWC_URL` | No | - | Nostr Wallet Connect string. Can be set in the setup wizard instead. |
| `SESSION_SECRET` | Yes | random (insecure) | Random string for JWT signing (`openssl rand -hex 32`) |
| `DATABASE_URL` | No | embedded Postgres | PostgreSQL connection string (`docker run` uses built-in Postgres) |
| `ENCRYPTION_KEY` | Recommended | random | 32-char hex for AES card key encryption at rest |
| `PORT` | No | `3000` | HTTP port the server listens on |
| `SHOP_API_URL` | No | `https://bitpos.app/api/shop` | Fulfillment API base URL |
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

**Does the quick tunnel work on a home internet connection?**
Yes. Cloudflare Tunnel connects outbound from your container to Cloudflare's network — no inbound ports need to be open. It works behind NAT, CGNAT, and ISPs that block port 80/443.

**The quick tunnel URL changed after a restart — what happened to my Lightning address?**
Quick tunnel URLs are temporary. For a permanent Lightning address, set up a named tunnel (free Cloudflare account + your own domain). See "Getting a Public URL" above.

**Can I use a different Lightning wallet?**
Yes, any NWC-compatible wallet works. Alby Hub is recommended because it supports all required methods (pay_invoice, make_invoice, lookup_invoice).

**Is my data private?**
All transaction and balance data lives in your local Postgres database. The only data sent externally is shop orders (shipping address + payment) to bitpos.app for fulfillment. Cloudflare Tunnel traffic passes through Cloudflare's network in encrypted form.

**What happens if I lose my PIN?**
Delete the database volume and run setup again. Your wallet funds are safe - they live in your connected Lightning wallet (NWC), not in bitPOS.

**Can I run this without Docker?**
Yes. Set `DATABASE_URL`, `NWC_URL`, and `DOMAIN` in your environment and run:
```bash
cd server && npm install && npm run build
node dist/index.mjs
```
The web build must be placed in `../public/` relative to `server/`. For a public URL, run `cloudflared tunnel --url http://localhost:3000` separately.

**What is the LNURL address?**
When `DOMAIN` is set correctly (or auto-detected via quick tunnel), your Lightning address is `handle@yourdomain`. Anyone can send sats to this address - they land directly in your connected wallet.

---

## Architecture

```
bitPOS OSS
- server/        Express + TypeScript API
  - src/db/    Drizzle schema (Postgres)
  - src/lib/   NWC, boltcard, payment, shopProxy, ...
  - src/routes/
- web/           React + Vite PWA (served statically)
- docker/
  - entrypoint.sh   Postgres init + Cloudflare Tunnel + Node startup
- Dockerfile     Multi-stage build (embeds Postgres + cloudflared)
```

The Docker image builds both server and web, then runs a single process that:
1. Starts embedded Postgres (if no `DATABASE_URL` provided)
2. Starts Cloudflare Tunnel (quick or named, unless `DOMAIN` is set manually)
3. Waits for the tunnel URL (quick tunnel only) and exports it as `DOMAIN`
4. Starts the Node.js server, which reads `DOMAIN` for all URL construction

---

## Contributing

- **Bugs & feature requests**: [GitHub Issues](https://github.com/satosys-tech/bitpos-core/issues)
- **Discussion**: [GitHub Discussions](https://github.com/satosys-tech/bitpos-core/discussions)

Pull requests welcome! Please open an issue or discussion before large changes.

---

## License

MIT - see [LICENSE](LICENSE)

The hosted bitpos.app service (fulfillment, card shop, hosted accounts) runs on this Core. This repository is the self-hosted open-source edition.
