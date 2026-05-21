import { NWCClient } from "@getalby/sdk";
import { createHash } from "crypto";
import { logger } from "./logger.js";

const NWC_URL = process.env.NWC_URL;

function getClient(): NWCClient {
  if (!NWC_URL) throw new Error("NWC_URL is not configured - set NWC_URL environment variable");
  return new NWCClient({ nostrWalletConnectUrl: NWC_URL });
}

function paymentHashFromPreimage(preimageHex: string): string {
  return createHash("sha256")
    .update(Buffer.from(preimageHex, "hex"))
    .digest("hex");
}

export interface MakeInvoiceResult {
  bolt11: string;
  paymentHash: string;
  expiresAt: Date;
}

export interface PayInvoiceResult {
  preimage: string;
  paymentHash: string;
}

export interface LookupInvoiceResult {
  paid: boolean;
  paidAt?: Date;
  amountMsats?: number;
}

export interface GetBalanceResult {
  balanceSats: number;
}

export interface NwcTransaction {
  type: "incoming" | "outgoing";
  paymentHash: string;
  preimage?: string;
  amountMsats: number;
  feesMsats?: number;
  createdAt: Date;
  settledAt?: Date;
  description?: string;
}

export async function makeInvoice(
  amountSats: number,
  description: string,
  expirySeconds = 3600,
): Promise<MakeInvoiceResult> {
  const client = getClient();
  try {
    const result = await client.makeInvoice({
      amount: amountSats * 1000,
      description,
      expiry: expirySeconds,
    });
    return {
      bolt11: result.invoice,
      paymentHash: result.payment_hash,
      expiresAt: new Date(Date.now() + expirySeconds * 1000),
    };
  } finally {
    client.close();
  }
}

export async function payInvoice(bolt11: string): Promise<PayInvoiceResult> {
  const client = getClient();
  try {
    const result = await client.payInvoice({ invoice: bolt11 });
    const preimage = result.preimage;
    const paymentHash = paymentHashFromPreimage(preimage);
    return { preimage, paymentHash };
  } finally {
    client.close();
  }
}

export async function lookupInvoice(paymentHash: string): Promise<LookupInvoiceResult> {
  const client = getClient();
  try {
    const result = await client.lookupInvoice({ payment_hash: paymentHash });
    const paid = result.state === "settled" || result.settled_at != null;
    return {
      paid,
      paidAt: paid && result.settled_at ? new Date(result.settled_at * 1000) : undefined,
      amountMsats: result.amount,
    };
  } finally {
    client.close();
  }
}

export async function getBalance(): Promise<GetBalanceResult> {
  const client = getClient();
  try {
    const result = await client.getBalance();
    return { balanceSats: Math.floor(result.balance / 1000) };
  } finally {
    client.close();
  }
}

export async function subscribeToPayments(
  onPayment: (paymentHash: string, paidAt: Date) => Promise<void>,
): Promise<() => void> {
  if (!NWC_URL) return () => {};
  const client = new NWCClient({ nostrWalletConnectUrl: NWC_URL });
  try {
    const unsub = await client.subscribeNotifications(
      async (notif) => {
        if (notif.notification_type !== "payment_received") return;
        const tx = notif.notification;
        const paidAt = tx.settled_at ? new Date(tx.settled_at * 1000) : new Date();
        await onPayment(tx.payment_hash, paidAt).catch((err) =>
          logger.warn({ err, paymentHash: tx.payment_hash }, "Payment notification handler error"),
        );
      },
      ["payment_received"],
    );
    return () => { unsub(); client.close(); };
  } catch (err) {
    logger.warn({ err }, "NWC subscription failed");
    client.close();
    return () => {};
  }
}

export function isConfigured(): boolean {
  return Boolean(NWC_URL);
}

logger.info({ configured: isConfigured() }, "NWC service initialized");
