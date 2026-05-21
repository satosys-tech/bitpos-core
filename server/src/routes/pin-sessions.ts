import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { db, pinPaymentSessionsTable, cardsTable, transactionsTable } from "../db/index.js";
import { processPayment } from "../lib/payment.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.get("/pin-session/:id", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const [session] = await db.select({
    id: pinPaymentSessionsTable.id,
    amountSats: pinPaymentSessionsTable.amountSats,
    status: pinPaymentSessionsTable.status,
    expiresAt: pinPaymentSessionsTable.expiresAt,
    cardLabel: pinPaymentSessionsTable.cardLabel,
  }).from(pinPaymentSessionsTable).where(eq(pinPaymentSessionsTable.id, id));

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const isExpired =
    (session.status === "pending" || session.status === "processing") &&
    new Date() > new Date(session.expiresAt);
  const effectiveStatus = isExpired ? "expired" : session.status;

  res.json({
    amountSats: session.amountSats,
    status: effectiveStatus,
    expiresAt: session.expiresAt,
    cardLabel: session.cardLabel ?? null,
  });
});

router.post("/pin-session/:id/authorize", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const pin = typeof req.body?.pin === "string" ? req.body.pin : null;

  if (!pin || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ status: "ERROR", reason: "PIN must be exactly 4 digits" });
    return;
  }

  const [session] = await db.select().from(pinPaymentSessionsTable).where(eq(pinPaymentSessionsTable.id, id));
  if (!session) { res.status(404).json({ status: "ERROR", reason: "Session not found" }); return; }
  if (session.status === "authorized") { res.json({ status: "OK", reason: "Already authorized" }); return; }
  if (session.status === "processing") {
    res.status(409).json({ status: "PENDING", reason: "Payment already in progress — please wait" });
    return;
  }
  if (session.status === "expired" || new Date() > new Date(session.expiresAt)) {
    await db.update(pinPaymentSessionsTable).set({ status: "expired" }).where(eq(pinPaymentSessionsTable.id, id));
    res.status(410).json({ status: "ERROR", reason: "Session expired — please tap your card again" });
    return;
  }
  if (session.status === "failed") {
    res.status(403).json({ status: "ERROR", reason: "Card is locked — unlock it in the bitPOS app" });
    return;
  }

  const [card] = await db.select({
    status: cardsTable.status, pinHash: cardsTable.pinHash,
    pinFailCount: cardsTable.pinFailCount, pinLockedAt: cardsTable.pinLockedAt,
    dailyLimitSats: cardsTable.dailyLimitSats,
  }).from(cardsTable).where(eq(cardsTable.id, session.cardId));

  if (!card?.pinHash) { res.status(409).json({ status: "ERROR", reason: "Card PIN not configured" }); return; }
  if (card.status !== "active") {
    res.status(403).json({ status: "ERROR", reason: `Card is ${card.status} — check the bitPOS app` });
    return;
  }
  if (card.pinLockedAt) {
    await db.update(pinPaymentSessionsTable).set({ status: "failed" }).where(eq(pinPaymentSessionsTable.id, id));
    res.status(403).json({ status: "ERROR", reason: "Card is locked — unlock it in the bitPOS app" });
    return;
  }

  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const [spentRow] = await db.select({
    totalSats: sql<number>`coalesce(sum(${transactionsTable.amountSats}), 0)`,
  }).from(transactionsTable).where(
    and(
      eq(transactionsTable.cardId, session.cardId),
      eq(transactionsTable.direction, "out"),
      eq(transactionsTable.status, "completed"),
      gte(transactionsTable.createdAt, todayUtc),
    ),
  );

  const spentToday = Number(spentRow?.totalSats ?? 0);
  if (spentToday + session.amountSats > card.dailyLimitSats) {
    res.status(403).json({ status: "ERROR", reason: "Daily spending limit would be exceeded" });
    return;
  }

  const pinMatch = await bcrypt.compare(pin, card.pinHash);
  if (!pinMatch) {
    const newCardFailCount = card.pinFailCount + 1;
    const newSessionFailCount = session.pinFailCount + 1;

    if (newCardFailCount >= 3) {
      await db.update(cardsTable).set({ pinFailCount: newCardFailCount, pinLockedAt: new Date() }).where(eq(cardsTable.id, session.cardId));
      await db.update(pinPaymentSessionsTable).set({ status: "failed", pinFailCount: newSessionFailCount }).where(eq(pinPaymentSessionsTable.id, id));
      logger.warn({ sessionId: id, cardId: session.cardId }, "Card PIN locked via hosted session after 3 failures");
      res.status(403).json({ status: "ERROR", reason: "Card is now locked — unlock it in the bitPOS app." });
    } else {
      await db.update(cardsTable).set({ pinFailCount: newCardFailCount }).where(eq(cardsTable.id, session.cardId));
      await db.update(pinPaymentSessionsTable).set({ pinFailCount: newSessionFailCount }).where(eq(pinPaymentSessionsTable.id, id));
      const attemptsLeft = 3 - newCardFailCount;
      res.status(401).json({
        status: "ERROR",
        reason: `Incorrect PIN. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.`,
        attemptsLeft,
      });
    }
    return;
  }

  const [claimed] = await db.update(pinPaymentSessionsTable).set({ status: "processing" })
    .where(and(eq(pinPaymentSessionsTable.id, id), eq(pinPaymentSessionsTable.status, "pending")))
    .returning({ id: pinPaymentSessionsTable.id });

  if (!claimed) {
    res.status(409).json({ status: "PENDING", reason: "Payment already in progress — please wait" });
    return;
  }

  try {
    const { paymentHash } = await processPayment(
      session.accountId,
      session.pr,
      session.amountSats,
      undefined,
      `Bolt Card payment (${session.cardLabel ?? session.cardId.slice(-8)})`,
      session.cardId,
    );

    await db.update(pinPaymentSessionsTable).set({ status: "authorized" }).where(eq(pinPaymentSessionsTable.id, id));
    db.update(cardsTable).set({ pinFailCount: 0 }).where(eq(cardsTable.id, session.cardId)).catch(
      (err) => logger.error({ err, cardId: session.cardId }, "Failed to reset card PIN fail count"),
    );

    logger.info({ sessionId: id, cardId: session.cardId, amountSats: session.amountSats, paymentHash }, "PIN session payment authorized");
    res.json({ status: "OK" });
  } catch (err: unknown) {
    await db.update(pinPaymentSessionsTable).set({ status: "pending" }).where(eq(pinPaymentSessionsTable.id, id))
      .catch((resetErr) => logger.error({ resetErr, sessionId: id }, "CRITICAL: failed to reset PIN session status after payment failure"));
    const msg = err instanceof Error ? err.message : "Payment failed";
    logger.error({ sessionId: id, cardId: session.cardId, err: msg }, "Payment failed in PIN session");
    res.status(500).json({ status: "ERROR", reason: msg });
  }
});

export async function expireStalePinSessions(): Promise<void> {
  const now = new Date();
  const result = await db.update(pinPaymentSessionsTable).set({ status: "expired" }).where(
    and(
      sql`${pinPaymentSessionsTable.status} IN ('pending', 'processing')`,
      lt(pinPaymentSessionsTable.expiresAt, now),
    ),
  ).returning({ id: pinPaymentSessionsTable.id });
  if (result.length > 0) logger.info({ count: result.length }, "Expired stale PIN payment sessions");
}

export default router;
