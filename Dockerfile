# ── Stage 1: Build the web PWA ───────────────────────────────────────────────
FROM node:22-alpine AS web-builder
WORKDIR /build/web

COPY web/package.json ./
RUN npm install

COPY web/ ./
RUN npm run build

# ── Stage 2: Build the server ────────────────────────────────────────────────
FROM node:22-alpine AS server-builder
WORKDIR /build/server

COPY server/package.json ./
RUN npm install

COPY server/ ./
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Install Postgres + su-exec for the embedded single-container mode,
# plus wget for downloading cloudflared below.
RUN apk add --no-cache postgresql16 postgresql16-client su-exec wget \
    && mkdir -p /run/postgresql \
    && chown -R postgres:postgres /run/postgresql

# Install cloudflared (multi-arch: amd64 and arm64).
# The Go binary is statically compiled and works on Alpine (musl) without glibc.
# Architecture is detected at build time so `docker buildx build --platform`
# cross-builds work correctly.
#
# To upgrade: update CLOUDFLARED_VERSION and the two SHA256 values below.
# Get checksums from: https://github.com/cloudflare/cloudflared/releases
ARG TARGETARCH
ARG CLOUDFLARED_VERSION=2026.5.0
ARG CLOUDFLARED_SHA256_AMD64=0095e46fdc88855d801c4d304cb1f5dd4bd656116c47ab94c2ad0ae7cda1c7ec
ARG CLOUDFLARED_SHA256_ARM64=2dc0945345677d27de3ae390a31c3b168866b48766da5f4cfd3fc473ce572303
RUN set -eux; \
    ARCH="${TARGETARCH:-}"; \
    if [ -z "$ARCH" ]; then \
      case "$(uname -m)" in \
        x86_64)  ARCH="amd64" ;; \
        aarch64) ARCH="arm64" ;; \
        armv7l)  ARCH="arm" ;; \
        *)       ARCH="amd64" ;; \
      esac; \
    fi; \
    case "$ARCH" in \
      amd64) EXPECTED_SHA256="${CLOUDFLARED_SHA256_AMD64}" ;; \
      arm64) EXPECTED_SHA256="${CLOUDFLARED_SHA256_ARM64}" ;; \
      *)     echo "Unsupported arch: $ARCH" && exit 1 ;; \
    esac; \
    wget -q \
      "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${ARCH}" \
      -O /usr/local/bin/cloudflared; \
    echo "${EXPECTED_SHA256}  /usr/local/bin/cloudflared" | sha256sum -c -; \
    chmod +x /usr/local/bin/cloudflared; \
    cloudflared --version

WORKDIR /app

# Install production server deps
COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev

# Copy built server
COPY --from=server-builder /build/server/dist ./server/dist

# Copy built web PWA into the static public dir
COPY --from=web-builder /build/web/dist ./public

# Copy the entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s \
  CMD wget -qO- http://127.0.0.1:3000/api/healthz || exit 1

ENTRYPOINT ["/entrypoint.sh"]
