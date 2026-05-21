import { Router, type IRouter } from "express";
import { db, cardsTable } from "../db/index.js";
import { eq, and, gte, isNotNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { decrypt, encrypt } from "../lib/encrypt.js";
import { logger } from "../lib/logger.js";
import { DOMAIN } from "../lib/domain.js";

const router: IRouter = Router();

function generateAesKey(): string {
  return randomBytes(16).toString("hex");
}

router.get("/wipe/:token", async (req, res): Promise<void> => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  if (!token) { res.status(400).json({ error: "Missing token" }); return; }

  const now = new Date();
  const [card] = await db
    .select()
    .from(cardsTable)
    .where(
      and(
        eq(cardsTable.wipeToken, token),
        isNotNull(cardsTable.wipeTokenExpiresAt),
        gte(cardsTable.wipeTokenExpiresAt, now),
      ),
    );

  if (!card) { res.status(404).json({ error: "Invalid or expired wipe token" }); return; }

  let k0: string, k1: string, k2: string, k3: string, k4: string;
  try {
    k0 = decrypt(card.aesKey0);
    k1 = decrypt(card.aesKey1);
    k2 = decrypt(card.aesKey2);
    k3 = decrypt(card.aesKey3);
    k4 = decrypt(card.aesKey4);
  } catch {
    logger.error({ cardId: card.id }, "Failed to decrypt card AES keys during wipe");
    res.status(500).json({ error: "Internal error" });
    return;
  }

  const newKeys = Array.from({ length: 5 }, generateAesKey);
  const [nk0, nk1, nk2, nk3, nk4] = newKeys;
  const newProvisionToken = randomBytes(24).toString("hex");
  const newProvisionTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.update(cardsTable).set({
    aesKey0: encrypt(nk0),
    aesKey1: encrypt(nk1),
    aesKey2: encrypt(nk2),
    aesKey3: encrypt(nk3),
    aesKey4: encrypt(nk4),
    counter: 0,
    uid: null,
    pendingK1: null,
    pendingK1ExpiresAt: null,
    provisionToken: newProvisionToken,
    provisionTokenExpiresAt: newProvisionTokenExpiresAt,
    wipeToken: null,
    wipeTokenExpiresAt: null,
  }).where(eq(cardsTable.id, card.id));

  const newProvisionUrl = `https://${DOMAIN}/api/provision/${newProvisionToken}`;
  logger.info({ cardId: card.id }, "Bolt Card wipe served — keys rotated");

  res.json({
    protocol_name: "wipe_bolt_card_response",
    protocol_version: 1,
    k0, k1, k2, k3, k4,
    new_provision_url: newProvisionUrl,
  });
});

export default router;
