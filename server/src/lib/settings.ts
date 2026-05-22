import { db, settingsTable } from "../db/index.js";
import { eq, sql } from "drizzle-orm";

export type SettingKey = "nwc_url";

const cache = new Map<SettingKey, string | null>();

export async function getSetting(key: SettingKey): Promise<string | null> {
  if (cache.has(key)) return cache.get(key) ?? null;
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, key));
  const value = row?.value ?? null;
  cache.set(key, value);
  return value;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await db.execute(
    sql`INSERT INTO settings (key, value) VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
  );
  cache.set(key, value);
}

export function invalidateSetting(key: SettingKey): void {
  cache.delete(key);
}
