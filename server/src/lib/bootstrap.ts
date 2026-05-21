/**
 * First-boot bootstrap: creates the single entity and account if they don't exist.
 * Called from index.ts after the DB is ready.
 */
import { db, entitiesTable, accountsTable } from "../db/index.js";
import { logger } from "./logger.js";

export async function getOrCreateAccount(): Promise<{ entityId: string; accountId: string } | null> {
  const [entity] = await db.select({ id: entitiesTable.id }).from(entitiesTable).limit(1);
  if (!entity) return null;
  const [account] = await db.select({ id: accountsTable.id }).from(accountsTable).limit(1);
  if (!account) return null;
  return { entityId: entity.id, accountId: account.id };
}

export async function isSetupComplete(): Promise<boolean> {
  const [entity] = await db.select({ id: entitiesTable.id }).from(entitiesTable).limit(1);
  return Boolean(entity);
}

export async function getAccountId(): Promise<string | null> {
  const [account] = await db.select({ id: accountsTable.id }).from(accountsTable).limit(1);
  return account?.id ?? null;
}

logger.info("Bootstrap module loaded");
