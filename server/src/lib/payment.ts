/**
 * Simplified outbound Lightning payment processor for single-user OSS edition.
 * No fee engine — the user's NWC pays directly, no platform fee deducted.
 */
import { db, accountsTable, transactionsTable } from "../db/index.js";
import { and, eq, gte, sql } from "drizzle-orm";
import { payInvoice } from "./nwc.js";
import { logger } from "./logger.js";

export async function processPayment(
  accountId: string,
  bolt11: string,
  amountSats: number,
  counterpartLnAddress?: string,
  memo?: string,
  cardId?: string,
): Promise<{ paymentHash: string }> {
  // Step 1: Debit balance atomically
  const reserved = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(accountsTable)
      .set({ balanceSats: sql`${accountsTable.balanceSats} - ${amountSats}` })
      .where(
        and(
          eq(accountsTable.id, accountId),
          gte(accountsTable.balanceSats, amountSats),
        ),
      )
      .returning({ balanceSats: accountsTable.balanceSats });

    if (!updated) return null;

    const [pendingTx] = await tx
      .insert(transactionsTable)
      .values({
        accountId,
        direction: "out",
        amountSats,
        feeSats: 0,
        type: "send",
        counterpartLnAddress,
        bolt11,
        status: "pending",
        memo,
        cardId: cardId ?? null,
      })
      .returning({ id: transactionsTable.id });

    return pendingTx;
  });

  if (!reserved) {
    throw new Error(`Insufficient balance (need ${amountSats} sats)`);
  }

  const pendingTxId = reserved.id;

  // Step 2: Send Lightning payment
  let payResult: { paymentHash: string; preimage: string };
  try {
    payResult = await payInvoice(bolt11);
  } catch (err) {
    // Compensate: refund balance + mark failed
    await db.transaction(async (tx) => {
      await tx
        .update(accountsTable)
        .set({ balanceSats: sql`${accountsTable.balanceSats} + ${amountSats}` })
        .where(eq(accountsTable.id, accountId));
      await tx
        .update(transactionsTable)
        .set({ status: "failed" })
        .where(eq(transactionsTable.id, pendingTxId));
    }).catch((compErr) =>
      logger.error({ compErr, pendingTxId }, "CRITICAL: compensation failed after payment error"),
    );
    throw err;
  }

  // Step 3: Finalize
  await db
    .update(transactionsTable)
    .set({ status: "completed", paymentHash: payResult.paymentHash })
    .where(eq(transactionsTable.id, pendingTxId));

  logger.info({ accountId, amountSats, paymentHash: payResult.paymentHash }, "Payment processed");
  return { paymentHash: payResult.paymentHash };
}

export async function creditAccount(
  accountId: string,
  amountSats: number,
  paymentHash?: string,
  bolt11?: string,
  memo?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(accountsTable)
      .set({ balanceSats: sql`${accountsTable.balanceSats} + ${amountSats}` })
      .where(eq(accountsTable.id, accountId));

    await tx.insert(transactionsTable).values({
      accountId,
      direction: "in",
      amountSats,
      feeSats: 0,
      type: "receive",
      paymentHash,
      bolt11,
      status: "completed",
      memo,
    });
  });
}
