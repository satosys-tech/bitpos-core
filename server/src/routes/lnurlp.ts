import { Router, type IRouter } from "express";
import { db, entitiesTable, accountsTable, pendingInvoicesTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { makeInvoice } from "../lib/nwc.js";
import { DOMAIN } from "../lib/domain.js";

const router: IRouter = Router();
const MIN_SENDABLE_MSATS = 1000;
const MAX_SENDABLE_MSATS = 100_000_000_000;

router.get("/.well-known/lnurlp/:handle", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.handle) ? req.params.handle[0] : req.params.handle;
  const handle = raw.toLowerCase();

  const [entity] = await db
    .select({ id: entitiesTable.id, handle: entitiesTable.handle })
    .from(entitiesTable)
    .where(eq(entitiesTable.handle, handle));

  if (!entity) { res.status(404).json({ status: "ERROR", reason: "User not found" }); return; }

  res.json({
    tag: "payRequest",
    callback: `https://${DOMAIN}/lnurlp/${handle}/callback`,
    minSendable: MIN_SENDABLE_MSATS,
    maxSendable: MAX_SENDABLE_MSATS,
    metadata: JSON.stringify([
      ["text/plain", `Send sats to ${handle}@${DOMAIN}`],
      ["text/identifier", `${handle}@${DOMAIN}`],
    ]),
  });
});

router.get("/lnurlp/:handle/callback", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.handle) ? req.params.handle[0] : req.params.handle;
  const handle = raw.toLowerCase();

  const amountMsats = Number(req.query.amount);
  if (!amountMsats || amountMsats < MIN_SENDABLE_MSATS || amountMsats > MAX_SENDABLE_MSATS) {
    res.status(400).json({ status: "ERROR", reason: "Invalid or missing amount" });
    return;
  }

  const amountSats = Math.ceil(amountMsats / 1000);

  const [entity] = await db
    .select({ id: entitiesTable.id })
    .from(entitiesTable)
    .where(eq(entitiesTable.handle, handle));

  if (!entity) { res.status(404).json({ status: "ERROR", reason: "User not found" }); return; }

  const [account] = await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(eq(accountsTable.entityId, entity.id));

  if (!account) { res.status(500).json({ status: "ERROR", reason: "Account not found" }); return; }

  const memo = `Payment to ${handle}@${DOMAIN}`;
  const invoiceResult = await makeInvoice(amountSats, memo, 3600);

  await db.insert(pendingInvoicesTable).values({
    accountId: account.id,
    bolt11: invoiceResult.bolt11,
    paymentHash: invoiceResult.paymentHash,
    amountSats,
    memo,
    expiresAt: invoiceResult.expiresAt,
  });

  res.json({ pr: invoiceResult.bolt11, routes: [] });
});

export default router;
