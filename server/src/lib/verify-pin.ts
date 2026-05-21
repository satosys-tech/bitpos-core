import bcrypt from "bcryptjs";
import { db, entitiesTable } from "../db/index.js";
import { eq } from "drizzle-orm";

export async function verifyEntityPin(entityId: string, pin: string): Promise<boolean> {
  const [entity] = await db
    .select({ pinHash: entitiesTable.pinHash })
    .from(entitiesTable)
    .where(eq(entitiesTable.id, entityId));

  if (!entity) throw new Error(`Entity not found: ${entityId}`);
  return bcrypt.compare(pin, entity.pinHash);
}
