/**
 * Authentication routes for single-user OSS edition.
 * POST /api/auth/login   - { pin } - no handle needed (single user)
 * POST /api/auth/refresh - uses refresh_token cookie
 * POST /api/auth/logout  - clears cookie
 * GET  /api/auth/me      - returns entity + account info
 */
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, entitiesTable, accountsTable } from "../db/index.js";
import { signToken, signRefreshToken, verifyToken } from "../lib/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const REFRESH_COOKIE_OPTS = (prod: boolean) => ({
  httpOnly: true,
  secure: prod,
  sameSite: "strict" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: "/",
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { pin } = req.body ?? {};

  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" });
    return;
  }

  const [entity] = await db.select().from(entitiesTable).limit(1);
  if (!entity) {
    res.status(404).json({ error: "Not configured. Run first-boot setup first." });
    return;
  }

  const valid = await bcrypt.compare(pin, entity.pinHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  const [account] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.entityId, entity.id))
    .limit(1);

  if (!account) { res.status(500).json({ error: "Account not found" }); return; }

  const prod = process.env.NODE_ENV === "production";
  const token = signToken({ entityId: entity.id, accountId: account.id });
  const refreshToken = signRefreshToken({ entityId: entity.id, accountId: account.id });

  res.cookie("refresh_token", refreshToken, REFRESH_COOKIE_OPTS(prod));

  logger.info({ entityId: entity.id }, "Login successful");
  res.json({
    token,
    entity: { id: entity.id, handle: entity.handle },
    account: { id: account.id, balanceSats: account.balanceSats, businessName: account.businessName },
  });
});

router.post("/auth/refresh", async (req, res): Promise<void> => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) { res.status(401).json({ error: "No refresh token" }); return; }

  try {
    verifyToken(refreshToken);
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
    return;
  }

  const [entity] = await db.select().from(entitiesTable).limit(1);
  const [account] = await db.select().from(accountsTable).limit(1);

  if (!entity || !account) { res.status(404).json({ error: "Not configured" }); return; }

  const prod = process.env.NODE_ENV === "production";
  const token = signToken({ entityId: entity.id, accountId: account.id });
  const newRefreshToken = signRefreshToken({ entityId: entity.id, accountId: account.id });

  res.cookie("refresh_token", newRefreshToken, REFRESH_COOKIE_OPTS(prod));
  res.json({
    token,
    entity: { id: entity.id, handle: entity.handle },
    account: { id: account.id, balanceSats: account.balanceSats, businessName: account.businessName },
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie("refresh_token", { path: "/" });
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, async (_req, res): Promise<void> => {
  const [entity] = await db.select().from(entitiesTable).limit(1);
  const [account] = await db.select().from(accountsTable).limit(1);

  if (!entity || !account) { res.status(404).json({ error: "Not configured" }); return; }
  res.json({
    entity: { id: entity.id, handle: entity.handle },
    account: { id: account.id, balanceSats: account.balanceSats, businessName: account.businessName },
  });
});

router.put("/auth/handle", requireAuth, async (req, res): Promise<void> => {
  const { handle } = req.body ?? {};
  if (typeof handle !== "string" || handle.trim().length < 1) {
    res.status(400).json({ error: "handle is required" });
    return;
  }
  const safe = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  const [entity] = await db.select().from(entitiesTable).limit(1);
  if (!entity) { res.status(404).json({ error: "Not configured" }); return; }
  await db.update(entitiesTable).set({ handle: safe, updatedAt: new Date() }).where(eq(entitiesTable.id, entity.id));
  res.json({ handle: safe });
});

router.put("/auth/pin", requireAuth, async (req, res): Promise<void> => {
  const { currentPin, newPin } = req.body ?? {};
  if (typeof currentPin !== "string" || !/^\d{4}$/.test(currentPin)) {
    res.status(400).json({ error: "currentPin must be 4 digits" });
    return;
  }
  if (typeof newPin !== "string" || !/^\d{4}$/.test(newPin)) {
    res.status(400).json({ error: "newPin must be 4 digits" });
    return;
  }
  const [entity] = await db.select().from(entitiesTable).limit(1);
  if (!entity) { res.status(404).json({ error: "Not configured" }); return; }
  const valid = await bcrypt.compare(currentPin, entity.pinHash);
  if (!valid) { res.status(401).json({ error: "Incorrect current PIN" }); return; }
  const newHash = await bcrypt.hash(newPin, 12);
  await db.update(entitiesTable).set({ pinHash: newHash, updatedAt: new Date() }).where(eq(entitiesTable.id, entity.id));
  res.json({ ok: true });
});

router.put("/auth/business-name", requireAuth, async (req, res): Promise<void> => {
  const { businessName } = req.body ?? {};
  const [account] = await db.select().from(accountsTable).limit(1);
  if (!account) { res.status(404).json({ error: "Not configured" }); return; }
  await db.update(accountsTable).set({ businessName: businessName ?? null, updatedAt: new Date() }).where(eq(accountsTable.id, account.id));
  res.json({ businessName: businessName ?? null });
});

export default router;
