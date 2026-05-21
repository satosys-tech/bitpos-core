import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import lnurlpRouter from "./routes/lnurlp.js";
import lnurlwRouter from "./routes/lnurlw.js";
import pinSessionsRouter from "./routes/pin-sessions.js";
import { logger } from "./lib/logger.js";

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

const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
  .split(",").map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || CORS_ORIGINS.includes(origin) || !origin.startsWith("http")) {
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

// PIN session (public — no auth required)
app.use("/api", pinSessionsRouter);

// All other API routes
app.use("/api", router);

export default app;
