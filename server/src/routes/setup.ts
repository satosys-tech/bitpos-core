/**
 * First-boot setup endpoints.
 *
 * GET  /api/setup-status   → { configured: boolean, nwcConfigured: boolean }
 * GET  /api/nwc-status     → live check that the saved NWC wallet is reachable
 * POST /api/nwc-test       → { nwcUrl } - validate a candidate URL without saving it
 * POST /api/setup          → { pin, handle?, nwcUrl } - persists wallet, creates entity + account, returns JWT
 */
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, entitiesTable, accountsTable } from "../db/index.js";
import { signToken, signRefreshToken } from "../lib/auth.js";
import { isSetupComplete } from "../lib/bootstrap.js";
import { getBalance, isConfigured, testNwcUrl, saveNwcUrl, NwcUnavailableError } from "../lib/nwc.js";
import { invalidateSetting } from "../lib/settings.js";
import { logger } from "../lib/logger.js";
import { DOMAIN, TUNNEL_MODE, lightningAddressHost, publicBaseUrl } from "../lib/domain.js";

const router: IRouter = Router();

router.get("/setup-status", async (_req, res): Promise<void> => {
  const configured = await isSetupComplete();
  const nwcConfigured = await isConfigured();
  res.json({
    configured,
    nwcConfigured,
    domain: DOMAIN,
    publicUrl: publicBaseUrl(),
    lnAddressHost: lightningAddressHost(),
    tunnelMode: TUNNEL_MODE,
  });
});

router.get("/nwc-status", async (_req, res): Promise<void> => {
  if (!(await isConfigured())) {
    res.json({ connected: false, error: "NWC wallet is not configured" });
    return;
  }
  try {
    const { balanceSats } = await getBalance();
    res.json({ connected: true, balanceSats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "NWC health check failed");
    res.json({ connected: false, error: msg });
  }
});

router.post("/nwc-test", async (req, res): Promise<void> => {
  const { nwcUrl } = req.body ?? {};
  if (typeof nwcUrl !== "string" || !nwcUrl.startsWith("nostr+walletconnect://")) {
    res.status(400).json({ connected: false, error: "NWC URL must start with nostr+walletconnect://" });
    return;
  }
  try {
    const { balanceSats } = await testNwcUrl(nwcUrl);
    res.json({ connected: true, balanceSats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(200).json({ connected: false, error: msg });
  }
});

router.post("/setup", async (req, res, next): Promise<void> => {
  try {
    if (await isSetupComplete()) {
      res.status(409).json({ error: "Already configured. Use /api/auth/login instead." });
      return;
    }

    const { pin, handle, nwcUrl } = req.body ?? {};

    if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: "PIN must be exactly 4 digits" });
      return;
    }

    // NWC URL is required at setup time unless one was supplied via env at boot.
    const envSupplied = await isConfigured();
    if (!nwcUrl && !envSupplied) {
      res.status(400).json({ error: "nwcUrl is required" });
      return;
    }
    if (nwcUrl) {
      if (typeof nwcUrl !== "string" || !nwcUrl.startsWith("nostr+walletconnect://")) {
        res.status(400).json({ error: "nwcUrl must start with nostr+walletconnect://" });
        return;
      }
      try {
        await testNwcUrl(nwcUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: `Wallet not reachable: ${msg}`, code: "NWC_UNREACHABLE" });
        return;
      }
      await saveNwcUrl(nwcUrl);
    }

    const finalHandle: string = typeof handle === "string" && handle.trim().length >= 1
      ? handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "")
      : "me";

    const pinHash = await bcrypt.hash(pin, 12);

    const [entity] = await db
      .insert(entitiesTable)
      .values({ handle: finalHandle, pinHash })
      .returning();

    const [account] = await db
      .insert(accountsTable)
      .values({ entityId: entity.id })
      .returning();

    const token = signToken({ entityId: entity.id, accountId: account.id });
    const refreshToken = signRefreshToken({ entityId: entity.id, accountId: account.id });

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    logger.info({ entityId: entity.id, handle: finalHandle }, "First-boot setup complete");

    res.status(201).json({
      token,
      entity: { id: entity.id, handle: entity.handle },
      account: { id: account.id, balanceSats: account.balanceSats },
    });
  } catch (err) {
    if (err instanceof NwcUnavailableError) {
      res.status(503).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
});

/**
 * Destructive: wipes the configured entity, all accounts, cards, transactions
 * and the saved NWC URL. Lets a user who's locked themselves out (forgotten
 * PIN, partially-completed setup) start over without dropping the database.
 *
 * Funds are safe — they live in the external NWC wallet, not in bitPOS.
 */
router.post("/setup/reset", async (req, res): Promise<void> => {
  const { confirm } = req.body ?? {};
  if (confirm !== "wipe-everything") {
    res.status(400).json({ error: "Confirmation phrase required" });
    return;
  }

  await db.execute(sql`
    TRUNCATE TABLE
      pin_payment_sessions,
      card_orders,
      transactions,
      pending_invoices,
      cards,
      accounts,
      entities,
      settings
    RESTART IDENTITY CASCADE
  `);

  invalidateSetting("nwc_url");
  res.clearCookie("refresh_token", { path: "/" });
  logger.warn("Setup was reset — all account data wiped");
  res.json({ ok: true });
});

export default router;
