/**
 * Account routes for single-user OSS edition.
 * No internal transfers, no fee engine, no Boltz swap.
 */
import { Router, type IRouter } from "express";
import { eq, desc, and, gte, isNull, sql } from "drizzle-orm";
import axios from "axios";
import { db, accountsTable, transactionsTable, pendingInvoicesTable, entitiesTable } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { makeInvoice } from "../lib/nwc.js";
import { processPayment } from "../lib/payment.js";
import { parseBolt11AmountSats } from "../lib/boltcard.js";
import { DOMAIN } from "../lib/domain.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function requireAccountAccess(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction): void {
  requireAuth(req, res, () => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (id && req.auth!.accountId !== id) { res.status(403).json({ error: "Forbidden" }); return; }
    next();
  });
}

// SSRF guard: reject private-range hostnames
function isSafeDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  const lower = domain.toLowerCase();
  const privatePatterns = [
    /^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^169\.254\./, /^::1$/, /^fc/, /^fd/, /^fe80/, /^0\.0\.0\.0$/,
  ];
  if (privatePatterns.some((p) => p.test(lower))) return false;
  return true;
}

function decodeLnurl(lnurl: string): string {
  const { bech32 } = require("bech32");
  const decoded = bech32.decode(lnurl, 2000);
  return Buffer.from(bech32.fromWords(decoded.words)).toString("utf8");
}

// GET /accounts/:id/balance
router.get("/accounts/:id/balance", requireAccountAccess, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [account] = await db.select({ balanceSats: accountsTable.balanceSats }).from(accountsTable).where(eq(accountsTable.id, id));
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  res.json({ balanceSats: account.balanceSats });
});

// GET /accounts/:id/transactions
router.get("/accounts/:id/transactions", requireAccountAccess, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const txs = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.accountId, id))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit)
    .offset(offset);
  res.json(txs);
});

// GET /accounts/:id/lightning-address
router.get("/accounts/:id/lightning-address", requireAccountAccess, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [account] = await db.select({ entityId: accountsTable.entityId }).from(accountsTable).where(eq(accountsTable.id, id));
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  const [entity] = await db.select({ handle: entitiesTable.handle }).from(entitiesTable).where(eq(entitiesTable.id, account.entityId));
  if (!entity) { res.status(404).json({ error: "Entity not found" }); return; }
  res.json({ lightningAddress: `${entity.handle}@${DOMAIN}` });
});

// POST /accounts/:id/invoice — generate receive invoice
router.post("/accounts/:id/invoice", requireAccountAccess, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { amountSats, memo } = req.body ?? {};

  if (!amountSats || typeof amountSats !== "number" || amountSats < 1) {
    res.status(400).json({ error: "amountSats must be a positive number" });
    return;
  }

  const invoiceResult = await makeInvoice(amountSats, memo ?? "bitPOS payment", 3600);

  await db.insert(pendingInvoicesTable).values({
    accountId: id,
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    memo: memo ?? null,
    expiresAt: invoiceResult.expiresAt,
  });

  res.status(201).json({
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    expiresAt: invoiceResult.expiresAt,
  });
});

// POST /accounts/:id/fund — alias for /invoice
router.post("/accounts/:id/fund", requireAccountAccess, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { amountSats, memo } = req.body ?? {};

  if (!amountSats || typeof amountSats !== "number" || amountSats < 1) {
    res.status(400).json({ error: "amountSats must be a positive number" });
    return;
  }

  const invoiceResult = await makeInvoice(amountSats, memo ?? "Fund bitPOS account", 3600);

  await db.insert(pendingInvoicesTable).values({
    accountId: id,
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    memo: memo ?? null,
    expiresAt: invoiceResult.expiresAt,
  });

  res.status(201).json({
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    expiresAt: invoiceResult.expiresAt,
  });
});

// POST /accounts/:id/pay
router.post("/accounts/:id/pay", requireAccountAccess, async (req, res): Promise<void> => {
  const accountId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { destination, amountSats, memo } = req.body ?? {};

  if (!destination || typeof destination !== "string") {
    res.status(400).json({ error: "destination is required" });
    return;
  }

  // Lightning address (user@domain)
  if (destination.includes("@")) {
    if (!amountSats) { res.status(400).json({ error: "amountSats is required for Lightning address payments" }); return; }

    const atIdx = destination.indexOf("@");
    const destHandle = destination.slice(0, atIdx).toLowerCase();
    const destDomain = destination.slice(atIdx + 1).toLowerCase();

    if (!isSafeDomain(destDomain)) { res.status(400).json({ error: "Invalid destination domain" }); return; }

    const metaResp = await axios.get(`https://${destDomain}/.well-known/lnurlp/${destHandle}`, { timeout: 10000 });
    const rawCallback = metaResp.data?.callback;
    if (!rawCallback) { res.status(400).json({ error: "Invalid LNURL-pay endpoint at destination" }); return; }

    let parsedCallback: URL;
    try { parsedCallback = new URL(rawCallback); } catch { res.status(400).json({ error: "Malformed callback URL from LNURL endpoint" }); return; }
    if (parsedCallback.protocol !== "https:") { res.status(400).json({ error: "LNURL callback must use HTTPS" }); return; }
    if (!isSafeDomain(parsedCallback.hostname)) { res.status(400).json({ error: "LNURL callback redirects to internal network" }); return; }

    const callbackResp = await axios.get(rawCallback, { params: { amount: amountSats * 1000 }, timeout: 10000 });
    const bolt11 = callbackResp.data?.pr;
    if (!bolt11) { res.status(400).json({ error: "No invoice returned from destination LNURL callback" }); return; }

    try {
      const result = await processPayment(accountId, bolt11, amountSats, destination, memo);
      res.json({ paymentHash: result.paymentHash, amountSats, feeSats: 0, type: "external" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(msg.toLowerCase().includes("insufficient") ? 400 : 502).json({ error: msg });
    }
    return;
  }

  // Raw LNURL (bech32-encoded)
  if (destination.toLowerCase().startsWith("lnurl1")) {
    if (!amountSats) { res.status(400).json({ error: "amountSats is required for LNURL payments" }); return; }

    let lnurlUrl: string;
    try {
      const { bech32 } = await import("bech32");
      const decoded = bech32.decode(destination, 2000);
      lnurlUrl = Buffer.from(bech32.fromWords(decoded.words)).toString("utf8");
    } catch { res.status(400).json({ error: "Failed to decode LNURL" }); return; }

    let parsedUrl: URL;
    try { parsedUrl = new URL(lnurlUrl); } catch { res.status(400).json({ error: "Invalid URL encoded in LNURL" }); return; }
    if (!isSafeDomain(parsedUrl.hostname)) { res.status(400).json({ error: "LNURL points to internal network" }); return; }

    const metaResp = await axios.get(lnurlUrl, { timeout: 10000 });
    const rawCallback = metaResp.data?.callback;
    if (!rawCallback) { res.status(400).json({ error: "Invalid LNURL-pay endpoint" }); return; }

    let parsedCallback: URL;
    try { parsedCallback = new URL(rawCallback); } catch { res.status(400).json({ error: "Malformed callback URL from LNURL endpoint" }); return; }
    if (!isSafeDomain(parsedCallback.hostname)) { res.status(400).json({ error: "LNURL callback redirects to internal network" }); return; }

    const callbackResp = await axios.get(rawCallback, { params: { amount: amountSats * 1000 }, timeout: 10000 });
    const bolt11 = callbackResp.data?.pr;
    if (!bolt11) { res.status(400).json({ error: "No invoice returned from LNURL callback" }); return; }

    try {
      const result = await processPayment(accountId, bolt11, amountSats, undefined, memo);
      res.json({ paymentHash: result.paymentHash, amountSats, feeSats: 0, type: "external" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(msg.toLowerCase().includes("insufficient") ? 400 : 502).json({ error: msg });
    }
    return;
  }

  // Raw bolt11 invoice
  if (!destination.toLowerCase().startsWith("ln")) {
    res.status(400).json({ error: "Invalid destination: must be a Lightning address, LNURL, or bolt11 invoice" });
    return;
  }

  const effectiveSats = amountSats ?? parseBolt11AmountSats(destination);
  if (!effectiveSats || effectiveSats < 1) {
    res.status(400).json({ error: "amountSats is required for zero-amount invoices" });
    return;
  }

  try {
    const result = await processPayment(accountId, destination, effectiveSats, undefined, memo);
    res.json({ paymentHash: result.paymentHash, amountSats: effectiveSats, feeSats: 0, type: "external" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(msg.toLowerCase().includes("insufficient") ? 400 : 502).json({ error: msg });
  }
});

export default router;
