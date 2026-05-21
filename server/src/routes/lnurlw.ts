/**
 * LNURLw (LNURL-withdraw) routes for Bolt Card tap-to-pay.
 * OSS edition: single user, no internal transfers, no fee engine.
 * All payments go via the user's NWC directly.
 */
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, cardsTable, accountsTable, transactionsTable } from "../db/index.js";
import { eq, and, gte, isNull, isNotNull, sql } from "drizzle-orm";
import { decryptSunP, verifySunC, parseBolt11AmountSats, generateK1 } from "../lib/boltcard.js";
import { processPayment } from "../lib/payment.js";
import { decrypt } from "../lib/encrypt.js";
import { logger } from "../lib/logger.js";
import { DOMAIN } from "../lib/domain.js";

const router: IRouter = Router();
const K1_TTL_MS = 5 * 60 * 1000;

function resolveKey(encrypted: string): string {
  return decrypt(encrypted);
}

// ── Tap endpoint: GET /card/:cardId?p=<hex>&c=<hex> ─────────────────────────
router.get("/card/:cardId", async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.cardId) ? req.params.cardId[0] : req.params.cardId;
  const pHex = String(req.query.p ?? "").toLowerCase();
  const cHex = String(req.query.c ?? "").toLowerCase();

  const [row] = await db
    .select({ card: cardsTable, balanceSats: accountsTable.balanceSats })
    .from(cardsTable)
    .innerJoin(accountsTable, eq(cardsTable.accountId, accountsTable.id))
    .where(eq(cardsTable.id, cardId));

  if (!row) { res.json({ status: "ERROR", reason: "Card not found" }); return; }
  const { card, balanceSats } = row;

  if (card.status === "cancelled") { res.json({ status: "ERROR", reason: "Card has been cancelled" }); return; }
  if (card.pinLockedAt) { res.json({ status: "ERROR", reason: "Card PIN is locked. Unlock it in the app." }); return; }

  const isProvisioningTest =
    /^0+$/.test(pHex) && /^0+$/.test(cHex) && pHex.length > 0 && cHex.length > 0;

  if (isProvisioningTest) {
    const provTestResp: Record<string, unknown> = {
      tag: "withdrawRequest",
      callback: `https://${DOMAIN}/card/${cardId}/callback`,
      k1: "0000000000000000000000000000000000000000000000000000000000000000",
      defaultDescription: card.note ?? "bitPOS card payment",
      minWithdrawable: 1000,
      maxWithdrawable: Math.min(card.perTapLimitSats, Number(balanceSats)) * 1000,
    };
    if (card.pinHash != null) provTestResp.pinLimit = card.pinLimitMsats ?? 0;
    res.json(provTestResp);
    return;
  }

  if (balanceSats <= 0) { res.json({ status: "ERROR", reason: "Account has no balance" }); return; }
  if (!pHex || !cHex) { res.json({ status: "ERROR", reason: "Missing p or c parameter" }); return; }

  let key1Hex: string;
  let key2Hex: string;
  try {
    key1Hex = resolveKey(card.aesKey1);
    key2Hex = resolveKey(card.aesKey2);
  } catch {
    logger.error({ cardId }, "Failed to decrypt card AES keys");
    res.json({ status: "ERROR", reason: "Internal error" });
    return;
  }

  const sunData = decryptSunP(key1Hex, pHex);
  if (!sunData) {
    res.json({ status: "ERROR", reason: "Card authentication failed. If you recently wiped this card, please re-provision it." });
    return;
  }

  if (!verifySunC(key2Hex, sunData.uid, sunData.counter, cHex)) {
    res.json({ status: "ERROR", reason: "Card authentication failed (CMAC mismatch). Please re-provision the card." });
    return;
  }

  const k1 = generateK1();
  const k1ExpiresAt = new Date(Date.now() + K1_TTL_MS);

  const advanced = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ counter: cardsTable.counter })
      .from(cardsTable)
      .where(eq(cardsTable.id, cardId))
      .for("update");

    if (!current) return false;
    if (sunData.counter <= current.counter) return false;

    await tx.update(cardsTable).set({
      counter: sunData.counter,
      lastUsedAt: new Date(),
      pendingK1: k1,
      pendingK1ExpiresAt: k1ExpiresAt,
      ...(card.uid == null ? { uid: sunData.uid.toString("hex") } : {}),
    }).where(eq(cardsTable.id, cardId));

    return true;
  });

  if (!advanced) {
    res.json({ status: "ERROR", reason: "Counter replay detected" });
    return;
  }

  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  const [spentRow] = await db
    .select({ totalSats: sql<number>`coalesce(sum(${transactionsTable.amountSats}), 0)` })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.cardId, cardId),
        eq(transactionsTable.direction, "out"),
        eq(transactionsTable.status, "completed"),
        gte(transactionsTable.createdAt, todayUtc),
      ),
    );

  const spentToday = Number(spentRow?.totalSats ?? 0);
  const remainingDailySats = card.dailyLimitSats - spentToday;

  if (remainingDailySats <= 0) { res.json({ status: "ERROR", reason: "Daily spending limit reached" }); return; }

  const maxWithdrawableSats = Math.min(card.perTapLimitSats, remainingDailySats);

  const tapResp: Record<string, unknown> = {
    tag: "withdrawRequest",
    callback: `https://${DOMAIN}/card/${cardId}/callback`,
    k1,
    defaultDescription: card.note ?? "bitPOS card payment",
    minWithdrawable: 1000,
    maxWithdrawable: maxWithdrawableSats * 1000,
  };
  if (card.pinHash != null) tapResp.pinLimit = card.pinLimitMsats ?? 0;
  res.json(tapResp);
});

// ── Callback: GET /card/:cardId/callback?k1=<challenge>&pr=<bolt11> ──────────
router.get("/card/:cardId/callback", async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.cardId) ? req.params.cardId[0] : req.params.cardId;
  const k1 = String(req.query.k1 ?? "");
  const pr = String(req.query.pr ?? "");
  const pinParam = req.query.pin ? String(req.query.pin) : undefined;

  if (!k1 || !pr) { res.json({ status: "ERROR", reason: "Missing k1 or pr parameter" }); return; }

  const [cardRow] = await db
    .select({ status: cardsTable.status, name: cardsTable.name, note: cardsTable.note })
    .from(cardsTable)
    .where(eq(cardsTable.id, cardId));

  if (cardRow?.status === "frozen") {
    res.json({ status: "ERROR", reason: "Card is frozen - unfreeze it in the bitPOS app to pay" });
    return;
  }

  const now = new Date();
  const [consumed] = await db
    .update(cardsTable)
    .set({ pendingK1: null, pendingK1ExpiresAt: null })
    .where(
      and(
        eq(cardsTable.id, cardId),
        eq(cardsTable.status, "active"),
        eq(cardsTable.pendingK1, k1),
        isNotNull(cardsTable.pendingK1ExpiresAt),
        gte(cardsTable.pendingK1ExpiresAt, now),
        isNull(cardsTable.pinLockedAt),
      ),
    )
    .returning({
      accountId: cardsTable.accountId,
      perTapLimitSats: cardsTable.perTapLimitSats,
      dailyLimitSats: cardsTable.dailyLimitSats,
      pinHash: cardsTable.pinHash,
      pinLimitMsats: cardsTable.pinLimitMsats,
      pinFailCount: cardsTable.pinFailCount,
    });

  if (!consumed) { res.json({ status: "ERROR", reason: "Invalid or expired k1" }); return; }

  const { accountId: cardAccountId, perTapLimitSats, dailyLimitSats, pinHash, pinLimitMsats, pinFailCount } = consumed;
  const cardShortId = cardId.replace(/-/g, "").slice(-8).replace(/(.{4})(.{4})/, "$1 $2");
  const cardLabel = cardRow?.name ?? cardShortId;

  const [accountRow] = await db
    .select({ id: accountsTable.id, balanceSats: accountsTable.balanceSats })
    .from(accountsTable)
    .where(eq(accountsTable.id, cardAccountId));

  if (!accountRow) { res.json({ status: "ERROR", reason: "Account not found" }); return; }

  const amountSats = parseBolt11AmountSats(pr);
  if (amountSats === null || amountSats <= 0) {
    res.json({ status: "ERROR", reason: "Invalid or zero-amount invoice" });
    return;
  }

  if (amountSats > perTapLimitSats) {
    res.json({ status: "ERROR", reason: `Amount ${amountSats} sats exceeds per-tap limit of ${perTapLimitSats} sats` });
    return;
  }

  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  const [spentRow] = await db
    .select({ totalSats: sql<number>`coalesce(sum(${transactionsTable.amountSats}), 0)` })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.cardId, cardId),
        eq(transactionsTable.direction, "out"),
        eq(transactionsTable.status, "completed"),
        gte(transactionsTable.createdAt, todayUtc),
      ),
    );

  const spentToday = Number(spentRow?.totalSats ?? 0);
  if (spentToday + amountSats > dailyLimitSats) {
    res.json({ status: "ERROR", reason: "Daily spending limit would be exceeded" });
    return;
  }

  // LUD-21 PIN verification
  if (pinHash) {
    const amountMsats = amountSats * 1000;
    const pinRequired = amountMsats >= (pinLimitMsats ?? 0);

    if (pinRequired) {
      if (!pinParam) { res.json({ status: "ERROR", reason: "PIN required" }); return; }

      const pinMatch = await bcrypt.compare(pinParam, pinHash);
      if (!pinMatch) {
        const newFailCount = pinFailCount + 1;
        if (newFailCount >= 3) {
          await db.update(cardsTable).set({ pinFailCount: newFailCount, pinLockedAt: new Date() }).where(eq(cardsTable.id, cardId));
          res.json({ status: "ERROR", reason: "Incorrect PIN. Card is now locked - unlock it in the app." });
        } else {
          await db.update(cardsTable).set({ pinFailCount: newFailCount }).where(eq(cardsTable.id, cardId));
          res.json({ status: "ERROR", reason: `Incorrect PIN. ${3 - newFailCount} attempt(s) remaining.` });
        }
        return;
      }

      await db.update(cardsTable).set({ pinFailCount: 0 }).where(eq(cardsTable.id, cardId));
    }
  }

  // OSS: all payments are external via NWC (no in-network transfer - single user)
  if (accountRow.balanceSats < amountSats) {
    res.json({ status: "ERROR", reason: "Insufficient balance" });
    return;
  }

  try {
    const { paymentHash } = await processPayment(
      accountRow.id,
      pr,
      amountSats,
      undefined,
      `Bolt Card payment (${cardLabel})`,
      cardId,
    );
    logger.info({ cardId, accountId: accountRow.id, amountSats, paymentHash }, "Bolt Card payment completed");
    res.json({ status: "OK" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Payment failed";
    logger.error({ cardId, accountId: accountRow.id, amountSats, err: msg }, "Bolt Card payment failed");
    res.json({ status: "ERROR", reason: msg });
  }
});

export default router;
