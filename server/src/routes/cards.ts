import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, cardsTable } from "../db/index.js";
import { encrypt, decrypt } from "../lib/encrypt.js";
import { verifyEntityPin } from "../lib/verify-pin.js";
import { requireAuth, requireAccountAccessByParam } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { DOMAIN } from "../lib/domain.js";

const requireAccountOwner = requireAccountAccessByParam("accountId");

const router: IRouter = Router();

function generateAesKey(): string {
  return randomBytes(16).toString("hex");
}

async function getCardOwnerAccountId(cardId: string): Promise<string | null> {
  const [row] = await db.select({ accountId: cardsTable.accountId }).from(cardsTable).where(eq(cardsTable.id, cardId));
  return row?.accountId ?? null;
}

async function requireCardAccess(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): Promise<void> {
  requireAuth(req, res, async () => {
    const rawCardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const ownerAccountId = await getCardOwnerAccountId(rawCardId);
    if (!ownerAccountId || req.auth?.accountId !== ownerAccountId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}

// POST /api/accounts/:accountId/cards
router.post("/accounts/:accountId/cards", requireAccountOwner, async (req, res): Promise<void> => {
  const accountId = Array.isArray(req.params.accountId) ? req.params.accountId[0] : req.params.accountId;

  const rawKeys = Array.from({ length: 5 }, generateAesKey);
  const [key0, key1, key2, key3, key4] = rawKeys;

  const provisionToken = randomBytes(24).toString("hex");
  const provisionTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [card] = await db.insert(cardsTable).values({
    accountId,
    aesKey0: encrypt(key0),
    aesKey1: encrypt(key1),
    aesKey2: encrypt(key2),
    aesKey3: encrypt(key3),
    aesKey4: encrypt(key4),
    provisionToken,
    provisionTokenExpiresAt,
  }).returning();

  logger.info({ cardId: card.id, accountId }, "Bolt Card issued");

  const provisionUrl = `https://${DOMAIN}/api/provision/${provisionToken}`;
  const lnurlwTemplate = `lnurlw://${DOMAIN}/card/${card.id}?p=00000000000000000000000000000000&c=0000000000000000`;

  res.status(201).json({
    cardId: card.id,
    status: card.status,
    perTapLimitSats: card.perTapLimitSats,
    dailyLimitSats: card.dailyLimitSats,
    provisionUrl,
    lnurlwTemplate,
    keys: { key0, key1, key2, key3, key4 },
    createdAt: card.createdAt,
  });
});

// GET /api/accounts/:accountId/cards
router.get("/accounts/:accountId/cards", requireAccountOwner, async (req, res): Promise<void> => {
  const accountId = Array.isArray(req.params.accountId) ? req.params.accountId[0] : req.params.accountId;

  const rows = await db.select({
    id: cardsTable.id, name: cardsTable.name, note: cardsTable.note,
    status: cardsTable.status, perTapLimitSats: cardsTable.perTapLimitSats,
    dailyLimitSats: cardsTable.dailyLimitSats, pinHash: cardsTable.pinHash,
    pinLimitMsats: cardsTable.pinLimitMsats, pinLockedAt: cardsTable.pinLockedAt,
    lastUsedAt: cardsTable.lastUsedAt, createdAt: cardsTable.createdAt,
  }).from(cardsTable).where(eq(cardsTable.accountId, accountId));

  res.json(rows.map(({ pinHash, pinLockedAt, ...rest }) => ({
    ...rest, pinEnabled: pinHash != null, pinLocked: pinLockedAt != null,
  })));
});

// PATCH /api/cards/:id
router.patch("/cards/:id", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { status, perTapLimitSats, dailyLimitSats, name, note } = req.body ?? {};

  if (!status && !perTapLimitSats && !dailyLimitSats && name === undefined && note === undefined) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [card] = await db.update(cardsTable).set({
    ...(status ? { status } : {}),
    ...(perTapLimitSats ? { perTapLimitSats } : {}),
    ...(dailyLimitSats ? { dailyLimitSats } : {}),
    ...(name !== undefined ? { name: name || null } : {}),
    ...(note !== undefined ? { note: note || null } : {}),
  }).where(eq(cardsTable.id, cardId)).returning({
    id: cardsTable.id, name: cardsTable.name, note: cardsTable.note,
    status: cardsTable.status, perTapLimitSats: cardsTable.perTapLimitSats,
    dailyLimitSats: cardsTable.dailyLimitSats, lastUsedAt: cardsTable.lastUsedAt,
    createdAt: cardsTable.createdAt,
  });

  if (!card) { res.status(404).json({ error: "Card not found" }); return; }
  res.json(card);
});

// POST /api/cards/:id/provision - generate a fresh provision token for an existing card
router.post("/cards/:id/provision", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const provisionToken = randomBytes(24).toString("hex");
  const provisionTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [card] = await db
    .update(cardsTable)
    .set({ provisionToken, provisionTokenExpiresAt, updatedAt: new Date() })
    .where(eq(cardsTable.id, cardId))
    .returning({ id: cardsTable.id });

  if (!card) { res.status(404).json({ error: "Card not found" }); return; }

  const provisionUrl = `https://${DOMAIN}/api/provision/${provisionToken}`;
  logger.info({ cardId }, "Bolt Card re-provision token generated");
  res.json({ provisionUrl });
});

// POST /api/cards/:id/keys (PIN-gated)
router.post("/cards/:id/keys", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { pin } = req.body as { pin?: string };

  if (!pin) { res.status(400).json({ error: "pin is required" }); return; }
  const { entityId } = req.auth!;
  let valid: boolean;
  try { valid = await verifyEntityPin(entityId, pin); }
  catch { res.status(404).json({ error: "Entity not found" }); return; }
  if (!valid) { res.status(401).json({ error: "Incorrect PIN" }); return; }

  const [card] = await db.select({
    id: cardsTable.id, aesKey0: cardsTable.aesKey0, aesKey1: cardsTable.aesKey1,
    aesKey2: cardsTable.aesKey2, aesKey3: cardsTable.aesKey3, aesKey4: cardsTable.aesKey4,
  }).from(cardsTable).where(eq(cardsTable.id, cardId));

  if (!card) { res.status(404).json({ error: "Card not found" }); return; }

  try {
    const k0 = decrypt(card.aesKey0), k1 = decrypt(card.aesKey1),
      k2 = decrypt(card.aesKey2), k3 = decrypt(card.aesKey3), k4 = decrypt(card.aesKey4);
    const lnurlwTemplate = `lnurlw://${DOMAIN}/card/${card.id}?p=00000000000000000000000000000000&c=0000000000000000`;
    res.json({ k0, k1, k2, k3, k4, lnurlwTemplate });
  } catch { res.status(500).json({ error: "Internal error decrypting keys" }); }
});

// POST /api/cards/:id/wipe (PIN-gated)
router.post("/cards/:id/wipe", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { pin } = req.body as { pin?: string };

  if (!pin) { res.status(400).json({ error: "pin is required" }); return; }
  const { entityId } = req.auth!;
  let valid: boolean;
  try { valid = await verifyEntityPin(entityId, pin); }
  catch { res.status(404).json({ error: "Entity not found" }); return; }
  if (!valid) { res.status(401).json({ error: "Incorrect PIN" }); return; }

  const [card] = await db.select({
    aesKey0: cardsTable.aesKey0, aesKey1: cardsTable.aesKey1,
    aesKey2: cardsTable.aesKey2, aesKey3: cardsTable.aesKey3, aesKey4: cardsTable.aesKey4,
  }).from(cardsTable).where(eq(cardsTable.id, cardId));

  if (!card) { res.status(404).json({ error: "Card not found" }); return; }

  let k0: string, k1: string, k2: string, k3: string, k4: string;
  try {
    k0 = decrypt(card.aesKey0); k1 = decrypt(card.aesKey1); k2 = decrypt(card.aesKey2);
    k3 = decrypt(card.aesKey3); k4 = decrypt(card.aesKey4);
  } catch { res.status(500).json({ error: "Internal error decrypting keys" }); return; }

  const newProvisionToken = randomBytes(24).toString("hex");
  const newProvisionTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.update(cardsTable).set({
    counter: 0, uid: null, pendingK1: null, pendingK1ExpiresAt: null,
    provisionToken: newProvisionToken, provisionTokenExpiresAt: newProvisionTokenExpiresAt,
    wipeToken: null, wipeTokenExpiresAt: null,
  }).where(eq(cardsTable.id, cardId));

  res.json({
    wipeKeys: { protocol_name: "wipe_bolt_card_response", protocol_version: 1, version: 1, action: "wipe", k0, k1, k2, k3, k4 },
    newProvisionUrl: `https://${DOMAIN}/api/provision/${newProvisionToken}`,
  });
});

// PUT /api/cards/:id/pin
router.put("/cards/:id/pin", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { pin, newPin, pinLimitMsats } = req.body ?? {};

  const [card] = await db.select({ pinHash: cardsTable.pinHash }).from(cardsTable).where(eq(cardsTable.id, cardId));
  if (!card) { res.status(404).json({ error: "Card not found" }); return; }

  if (card.pinHash) {
    if (!pin) { res.status(400).json({ error: "Current card PIN required to change or remove PIN" }); return; }
    const valid = await bcrypt.compare(pin, card.pinHash);
    if (!valid) { res.status(401).json({ error: "Incorrect current card PIN" }); return; }
  }

  const newPinHash = newPin != null ? await bcrypt.hash(newPin, 10) : null;
  const updatePayload: Record<string, unknown> = { pinHash: newPinHash, pinFailCount: 0, pinLockedAt: null };
  if (pinLimitMsats !== undefined) updatePayload.pinLimitMsats = pinLimitMsats ?? null;

  const [updated] = await db.update(cardsTable).set(updatePayload).where(eq(cardsTable.id, cardId))
    .returning({ pinHash: cardsTable.pinHash, pinLimitMsats: cardsTable.pinLimitMsats });

  res.json({ pinEnabled: updated.pinHash != null, pinLimitMsats: updated.pinLimitMsats ?? null });
});

// PUT /api/cards/:id/pin/limit
router.put("/cards/:id/pin/limit", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { pinLimitMsats } = req.body ?? {};

  const [updated] = await db.update(cardsTable).set({ pinLimitMsats: pinLimitMsats ?? null }).where(eq(cardsTable.id, cardId))
    .returning({ pinHash: cardsTable.pinHash, pinLimitMsats: cardsTable.pinLimitMsats });

  if (!updated) { res.status(404).json({ error: "Card not found" }); return; }
  res.json({ pinLimitMsats: updated.pinLimitMsats ?? null });
});

// PUT /api/cards/:id/pin/unlock
router.put("/cards/:id/pin/unlock", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { entityPin } = req.body ?? {};

  const { entityId } = req.auth!;
  let valid: boolean;
  try { valid = await verifyEntityPin(entityId, entityPin); }
  catch { res.status(404).json({ error: "Entity not found" }); return; }
  if (!valid) { res.status(401).json({ error: "Incorrect entity PIN" }); return; }

  const [updated] = await db.update(cardsTable).set({ pinLockedAt: null, pinFailCount: 0 }).where(eq(cardsTable.id, cardId))
    .returning({ id: cardsTable.id });

  if (!updated) { res.status(404).json({ error: "Card not found" }); return; }
  res.json({ pinLocked: false });
});

// DELETE /api/cards/:id
router.delete("/cards/:id", requireCardAccess, async (req, res): Promise<void> => {
  const cardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [card] = await db.update(cardsTable).set({ status: "cancelled" }).where(eq(cardsTable.id, cardId))
    .returning({ id: cardsTable.id, status: cardsTable.status });
  if (!card) { res.status(404).json({ error: "Card not found" }); return; }
  res.json({ id: card.id, status: card.status });
});

export default router;
