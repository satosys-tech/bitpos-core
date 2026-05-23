import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import lnurlpRouter from "./routes/lnurlp.js";
import lnurlwRouter from "./routes/lnurlw.js";
import pinSessionsRouter from "./routes/pin-sessions.js";
import { logger } from "./lib/logger.js";
import { NwcUnavailableError } from "./lib/nwc.js";
import { publicBaseUrl } from "./lib/domain.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
  .split(",").map((o) => o.trim()).filter(Boolean);
// Always allow the server's own public URL — critical for Cloudflare Tunnel
// where the dynamic trycloudflare.com domain isn't known at container build time.
const ownOrigin = publicBaseUrl();
if (!CORS_ORIGINS.includes(ownOrigin)) CORS_ORIGINS.push(ownOrigin);
// Wildcard suffix patterns (e.g. "*.replit.dev") supported in CORS_ORIGINS.
const CORS_WILDCARDS = CORS_ORIGINS.filter((o) => o.startsWith("*.")).map((o) => o.slice(1));

app.use(cors({
  origin: (origin, callback) => {
    // In development, allow all origins so the Replit preview iframe works
    // without needing to enumerate the full dev domain.
    if (!IS_PRODUCTION) {
      callback(null, true);
      return;
    }
    if (
      !origin ||
      !origin.startsWith("http") ||
      CORS_ORIGINS.includes(origin) ||
      CORS_WILDCARDS.some((suffix) => origin.endsWith(suffix))
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// LNURL-pay: .well-known at root, callback at root
app.use(lnurlpRouter);

// LNURLw: card tap + callback at root (NFC wallets call these directly)
app.use(lnurlwRouter);

// PIN session (public - no auth required)
app.use("/api", pinSessionsRouter);

// All other API routes
app.use("/api", router);

// JSON 404 for unmatched /api routes
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Global JSON error handler — keep last
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  if (err instanceof NwcUnavailableError) {
    res.status(503).json({ error: err.message, code: err.code });
    return;
  }
  const msg = err instanceof Error ? err.message : "Internal Server Error";
  logger.error({ err, url: req.url, method: req.method }, "Unhandled route error");
  res.status(500).json({ error: msg });
});

export default app;
