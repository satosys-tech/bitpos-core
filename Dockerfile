# ── Stage 1: Build the web PWA ───────────────────────────────────────────────
FROM node:20-alpine AS web-builder
WORKDIR /build/web

COPY web/package.json ./
RUN npm install

COPY web/ ./
RUN npm run build

# ── Stage 2: Build the server ────────────────────────────────────────────────
FROM node:20-alpine AS server-builder
WORKDIR /build/server

COPY server/package.json ./
RUN npm install

COPY server/ ./
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Install Postgres + su-exec for the embedded single-container mode
RUN apk add --no-cache postgresql15 postgresql15-client su-exec \
    && mkdir -p /run/postgresql \
    && chown -R postgres:postgres /run/postgresql

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
  CMD wget -qO- http://localhost:3000/api/healthz || exit 1

ENTRYPOINT ["/entrypoint.sh"]
