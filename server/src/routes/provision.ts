import { Router, type IRouter } from "express";
import { db, cardsTable } from "../db/index.js";
import { eq, and, gte, isNotNull } from "drizzle-orm";
import { decrypt } from "../lib/encrypt.js";
import { logger } from "../lib/logger.js";
import { DOMAIN } from "../lib/domain.js";

const router: IRouter = Router();

router.get("/provision/:token", async (req, res): Promise<void> => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;

  if (!token) { res.status(400).json({ error: "Missing token" }); return; }

  const now = new Date();
  const [card] = await db
    .select()
    .from(cardsTable)
    .where(
      and(
        eq(cardsTable.provisionToken, token),
        isNotNull(cardsTable.provisionTokenExpiresAt),
        gte(cardsTable.provisionTokenExpiresAt, now),
      ),
    );

  if (!card) { res.status(404).json({ error: "Invalid or expired provisioning token" }); return; }

  await db
    .update(cardsTable)
    .set({ provisionToken: null, provisionTokenExpiresAt: null })
    .where(eq(cardsTable.id, card.id));

  let key0: string, key1: string, key2: string, key3: string, key4: string;
  try {
    key0 = decrypt(card.aesKey0);
    key1 = decrypt(card.aesKey1);
    key2 = decrypt(card.aesKey2);
    key3 = decrypt(card.aesKey3);
    key4 = decrypt(card.aesKey4);
  } catch {
    logger.error({ cardId: card.id }, "Failed to decrypt card AES keys during provisioning");
    res.status(500).json({ error: "Internal error" });
    return;
  }

  const lnurlwBase = `lnurlw://${DOMAIN}/card/${card.id}`;
  logger.info({ cardId: card.id, accountId: card.accountId }, "Bolt Card provisioning data served");

  res.json({
    protocol_name: "new_bolt_card_response",
    protocol_version: 1,
    card_name: "bitPOS Card",
    lnurlw_base: lnurlwBase,
    uid_privacy: "Y",
    k0: key0,
    k1: key1,
    k2: key2,
    k3: key3,
    k4: key4,
  });
});

export default router;
