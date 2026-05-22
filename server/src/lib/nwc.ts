import { NWCClient } from "@getalby/sdk";
import { createHash } from "crypto";
import { logger } from "./logger.js";
import { getSetting, setSetting } from "./settings.js";

const ENV_NWC_URL = process.env.NWC_URL;

export class NwcUnavailableError extends Error {
  code: "NWC_NOT_CONFIGURED" | "NWC_UNREACHABLE";
  constructor(code: "NWC_NOT_CONFIGURED" | "NWC_UNREACHABLE", message: string) {
    super(message);
    this.code = code;
    this.name = "NwcUnavailableError";
  }
}

async function loadNwcUrl(): Promise<string | null> {
  // Env wins. An operator explicitly setting NWC_URL in their environment
  // should immediately rotate the configured wallet without DB surgery.
  if (ENV_NWC_URL) return ENV_NWC_URL;
  return (await getSetting("nwc_url")) ?? null;
}

async function getClient(): Promise<NWCClient> {
  const url = await loadNwcUrl();
  if (!url) throw new NwcUnavailableError("NWC_NOT_CONFIGURED", "Lightning wallet is not configured");
  return new NWCClient({ nostrWalletConnectUrl: url });
}

function wrapNwcErr(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Failed to connect|relay|websocket|timeout/i.test(msg)) {
    throw new NwcUnavailableError("NWC_UNREACHABLE", msg);
  }
  throw err instanceof Error ? err : new Error(msg);
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
  const client = await getClient();
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
  } catch (err) {
    wrapNwcErr(err);
  } finally {
    client.close();
  }
}

export async function payInvoice(bolt11: string): Promise<PayInvoiceResult> {
  const client = await getClient();
  try {
    const result = await client.payInvoice({ invoice: bolt11 });
    const preimage = result.preimage;
    const paymentHash = paymentHashFromPreimage(preimage);
    return { preimage, paymentHash };
  } catch (err) {
    wrapNwcErr(err);
  } finally {
    client.close();
  }
}

export async function lookupInvoice(paymentHash: string): Promise<LookupInvoiceResult> {
  const client = await getClient();
  try {
    const result = await client.lookupInvoice({ payment_hash: paymentHash });
    const paid = result.state === "settled" || result.settled_at != null;
    return {
      paid,
      paidAt: paid && result.settled_at ? new Date(result.settled_at * 1000) : undefined,
      amountMsats: result.amount,
    };
  } catch (err) {
    wrapNwcErr(err);
  } finally {
    client.close();
  }
}

export async function getBalance(): Promise<GetBalanceResult> {
  const client = await getClient();
  try {
    const result = await client.getBalance();
    return { balanceSats: Math.floor(result.balance / 1000) };
  } catch (err) {
    wrapNwcErr(err);
  } finally {
    client.close();
  }
}

/**
 * Validate a candidate NWC URL by performing a real `getBalance` call.
 * Used by the setup wizard so the user gets immediate feedback before saving.
 */
export async function testNwcUrl(url: string): Promise<GetBalanceResult> {
  const client = new NWCClient({ nostrWalletConnectUrl: url });
  try {
    const result = await client.getBalance();
    return { balanceSats: Math.floor(result.balance / 1000) };
  } catch (err) {
    wrapNwcErr(err);
  } finally {
    client.close();
  }
}

export async function saveNwcUrl(url: string): Promise<void> {
  await setSetting("nwc_url", url);
}

export async function subscribeToPayments(
  onPayment: (paymentHash: string, paidAt: Date) => Promise<void>,
): Promise<() => void> {
  const url = await loadNwcUrl();
  if (!url) return () => {};

  // Validate reachability first. @getalby/sdk's subscribeNotifications retries
  // forever on connection failure without backoff, which used to spam stderr
  // with thousands of stack traces when the relay was unreachable. We skip the
  // push subscription on validation failure and rely on the per-minute
  // fallback sweep (lookupInvoice) to settle payments.
  try {
    await testNwcUrl(url);
  } catch (err) {
    logger.warn({ err }, "NWC subscription skipped — wallet unreachable. Falling back to polling.");
    return () => {};
  }

  const client = new NWCClient({ nostrWalletConnectUrl: url });
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

export async function isConfigured(): Promise<boolean> {
  const url = await loadNwcUrl();
  return Boolean(url);
}

logger.info({ envConfigured: Boolean(ENV_NWC_URL) }, "NWC service initialized");
