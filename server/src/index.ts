import path from "path";
import { fileURLToPath } from "url";
import serveStatic from "serve-static";
import { runMigrations } from "./db/index.js";
import app from "./app.js";
import { startInvoiceMonitor } from "./lib/invoiceMonitor.js";
import { expireStalePinSessions } from "./routes/pin-sessions.js";
import { logger } from "./lib/logger.js";
import cron from "node-cron";

const PORT = Number(process.env.PORT ?? 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Run DB migrations (CREATE TABLE IF NOT EXISTS)
  logger.info("Running database migrations...");
  await runMigrations();
  logger.info("Migrations complete");

  // Serve built web PWA from /public (populated by Docker multi-stage build)
  const publicDir = path.resolve(__dirname, "..", "..", "public");
  app.use(serveStatic(publicDir, { index: "index.html" }));

  // SPA fallback: serve index.html for all non-API routes
  app.get(/^(?!\/api|\/card|\/lnurlp|\.well-known|\/provision|\/wipe).*$/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  // Start background jobs
  startInvoiceMonitor();
  cron.schedule("* * * * *", () => {
    expireStalePinSessions().catch((err) => logger.error({ err }, "PIN session expiry cron failed"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    logger.info({ port: PORT }, "bitPOS OSS server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
