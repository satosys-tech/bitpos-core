/**
 * First-boot setup endpoint.
 * GET  /api/setup-status   — returns { configured: boolean }
 * POST /api/setup          — { pin, handle? } — creates the single entity + account, returns JWT
 */
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, entitiesTable, accountsTable } from "../db/index.js";
import { signToken, signRefreshToken } from "../lib/auth.js";
import { isSetupComplete } from "../lib/bootstrap.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.get("/setup-status", async (_req, res): Promise<void> => {
  const configured = await isSetupComplete();
  res.json({ configured });
});

router.post("/setup", async (req, res): Promise<void> => {
  const alreadyConfigured = await isSetupComplete();
  if (alreadyConfigured) {
    res.status(409).json({ error: "Already configured. Use /api/auth/login instead." });
    return;
  }

  const { pin, handle } = req.body ?? {};

  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" });
    return;
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
});

export default router;
