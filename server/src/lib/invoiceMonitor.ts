import cron from "node-cron";
import { db, pendingInvoicesTable, accountsTable, transactionsTable } from "../db/index.js";
import { and, isNull, eq, sql } from "drizzle-orm";
import { lookupInvoice, subscribeToPayments } from "./nwc.js";
import { logger } from "./logger.js";

async function settleInvoice(invoice: {
  id: string;
  accountId: string;
  paymentHash: string;
  bolt11: string;
  amountSats: number;
  memo: string | null;
}, paidAt: Date): Promise<boolean> {
  let settled = false;

  await db.transaction(async (tx) => {
    const [marked] = await tx
      .update(pendingInvoicesTable)
      .set({ paidAt })
      .where(
        and(
          eq(pendingInvoicesTable.id, invoice.id),
          isNull(pendingInvoicesTable.paidAt),
        ),
      )
      .returning({ id: pendingInvoicesTable.id });

    if (!marked) return;
    settled = true;

    await tx
      .update(accountsTable)
      .set({ balanceSats: sql`${accountsTable.balanceSats} + ${invoice.amountSats}` })
      .where(eq(accountsTable.id, invoice.accountId));

    await tx.insert(transactionsTable).values({
      accountId: invoice.accountId,
      direction: "in",
      amountSats: invoice.amountSats,
      feeSats: 0,
      type: "receive",
      paymentHash: invoice.paymentHash,
      bolt11: invoice.bolt11,
      status: "completed",
      memo: invoice.memo ?? undefined,
    });
  });

  if (settled) {
    logger.info({ invoiceId: invoice.id, accountId: invoice.accountId, amountSats: invoice.amountSats }, "Invoice settled");
  }
  return settled;
}

async function settleByPaymentHash(paymentHash: string, paidAt: Date): Promise<void> {
  const [invoice] = await db
    .select()
    .from(pendingInvoicesTable)
    .where(and(eq(pendingInvoicesTable.paymentHash, paymentHash), isNull(pendingInvoicesTable.paidAt)));

  if (!invoice) return;
  await settleInvoice(invoice as Parameters<typeof settleInvoice>[0], paidAt);
}

async function runFallbackSweep(): Promise<void> {
  const now = new Date();
  const unpaid = await db
    .select()
    .from(pendingInvoicesTable)
    .where(isNull(pendingInvoicesTable.paidAt));

  for (const invoice of unpaid) {
    if (invoice.expiresAt < now) continue;
    try {
      const status = await lookupInvoice(invoice.paymentHash);
      if (!status.paid || !status.paidAt) continue;
      await settleInvoice(invoice as Parameters<typeof settleInvoice>[0], status.paidAt);
    } catch (err) {
      logger.warn({ err, invoiceId: invoice.id }, "Fallback sweep: failed to check invoice");
    }
  }
}

export function startInvoiceMonitor(): void {
  // Push subscription to main NWC wallet
  subscribeToPayments(settleByPaymentHash).catch(() => {});

  // Fallback sweep every minute
  cron.schedule("* * * * *", async () => {
    try { await runFallbackSweep(); }
    catch (err) { logger.error({ err }, "Invoice fallback sweep error"); }
  });

  runFallbackSweep().catch((err) => logger.warn({ err }, "Startup invoice sweep error"));
  logger.info("Invoice monitor started");
}
