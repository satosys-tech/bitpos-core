import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import {
  pgTable,
  pgEnum,
  text,
  uuid,
  bigint,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/bitpos";

if (!process.env.DATABASE_URL) {
  console.warn(
    "[bitpos] DATABASE_URL is not set — defaulting to postgresql://postgres:postgres@localhost:5432/bitpos. " +
    "Set DATABASE_URL to connect to your Postgres instance."
  );
}

const pool = new Pool({ connectionString: DATABASE_URL });

// ── Schema ────────────────────────────────────────────────────────────────────

export const entitiesTable = pgTable("entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  handle: text("handle").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountsTable = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id").notNull().references(() => entitiesTable.id),
  balanceSats: bigint("balance_sats", { mode: "number" }).notNull().default(0),
  businessName: text("business_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactionDirectionEnum = pgEnum("transaction_direction", ["in", "out"]);
export const transactionTypeEnum = pgEnum("transaction_type", [
  "receive", "send",
]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "completed", "failed"]);

export const cardsTable = pgTable("cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accountsTable.id),
  status: text("status").notNull().default("active"),
  aesKey0: text("aes_key_0").notNull(),
  aesKey1: text("aes_key_1").notNull(),
  aesKey2: text("aes_key_2").notNull(),
  aesKey3: text("aes_key_3").notNull(),
  aesKey4: text("aes_key_4").notNull(),
  uid: text("uid"),
  name: text("name"),
  note: text("note"),
  counter: integer("counter").notNull().default(0),
  perTapLimitSats: bigint("per_tap_limit_sats", { mode: "number" }).notNull().default(50000),
  dailyLimitSats: bigint("daily_limit_sats", { mode: "number" }).notNull().default(500000),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  pendingK1: text("pending_k1"),
  pendingK1ExpiresAt: timestamp("pending_k1_expires_at", { withTimezone: true }),
  provisionToken: text("provision_token"),
  provisionTokenExpiresAt: timestamp("provision_token_expires_at", { withTimezone: true }),
  wipeToken: text("wipe_token"),
  wipeTokenExpiresAt: timestamp("wipe_token_expires_at", { withTimezone: true }),
  pinHash: text("pin_hash"),
  pinLimitMsats: bigint("pin_limit_msats", { mode: "number" }),
  pinFailCount: integer("pin_fail_count").notNull().default(0),
  pinLockedAt: timestamp("pin_locked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactionsTable = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accountsTable.id),
  direction: transactionDirectionEnum("direction").notNull(),
  amountSats: bigint("amount_sats", { mode: "number" }).notNull(),
  feeSats: bigint("fee_sats", { mode: "number" }).notNull().default(0),
  type: transactionTypeEnum("type").notNull(),
  counterpartHandle: text("counterpart_handle"),
  counterpartLnAddress: text("counterpart_ln_address"),
  bolt11: text("bolt11"),
  paymentHash: text("payment_hash"),
  status: transactionStatusEnum("status").notNull().default("completed"),
  memo: text("memo"),
  cardId: uuid("card_id").references(() => cardsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pendingInvoicesTable = pgTable("pending_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accountsTable.id),
  bolt11: text("bolt11").notNull(),
  paymentHash: text("payment_hash").notNull().unique(),
  amountSats: bigint("amount_sats", { mode: "number" }).notNull(),
  memo: text("memo"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cardDesignsTable = pgTable("card_designs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  artist: text("artist"),
  previewUrl: text("preview_url").notNull().default(""),
  priceEurCents: integer("price_eur_cents").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cardOrdersTable = pgTable("card_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accountsTable.id),
  remoteOrderId: text("remote_order_id"),
  designId: text("design_id"),
  status: text("status").notNull().default("pending"),
  quantity: integer("quantity").notNull().default(1),
  shippingName: text("shipping_name").notNull(),
  shippingEmail: text("shipping_email"),
  shippingPhone: text("shipping_phone"),
  shippingAddress1: text("shipping_address1").notNull(),
  shippingAddress2: text("shipping_address2"),
  shippingCity: text("shipping_city").notNull(),
  shippingPostalCode: text("shipping_postal_code").notNull(),
  shippingCountry: text("shipping_country").notNull(),
  trackingNumber: text("tracking_number"),
  amountSats: integer("amount_sats").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pinSessionStatusEnum = pgEnum("pin_session_status", [
  "pending", "processing", "authorized", "expired", "failed",
]);

export const pinPaymentSessionsTable = pgTable("pin_payment_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  cardId: uuid("card_id").notNull().references(() => cardsTable.id),
  accountId: uuid("account_id").notNull().references(() => accountsTable.id),
  pr: text("pr").notNull(),
  amountSats: bigint("amount_sats", { mode: "number" }).notNull(),
  feeSats: bigint("fee_sats", { mode: "number" }).notNull(),
  cardLabel: text("card_label"),
  status: pinSessionStatusEnum("status").notNull().default("pending"),
  pinFailCount: integer("pin_fail_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── DB client ─────────────────────────────────────────────────────────────────

export const db = drizzle(pool);

// ── Bootstrap (create tables if not exist) ────────────────────────────────────

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS entities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      handle TEXT NOT NULL UNIQUE,
      pin_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL REFERENCES entities(id),
      balance_sats BIGINT NOT NULL DEFAULT 0,
      business_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    DO $$ BEGIN
      CREATE TYPE transaction_direction AS ENUM ('in', 'out');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE transaction_type AS ENUM ('receive', 'send');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS cards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id),
      status TEXT NOT NULL DEFAULT 'active',
      aes_key_0 TEXT NOT NULL,
      aes_key_1 TEXT NOT NULL,
      aes_key_2 TEXT NOT NULL,
      aes_key_3 TEXT NOT NULL,
      aes_key_4 TEXT NOT NULL,
      uid TEXT,
      name TEXT,
      note TEXT,
      counter INTEGER NOT NULL DEFAULT 0,
      per_tap_limit_sats BIGINT NOT NULL DEFAULT 50000,
      daily_limit_sats BIGINT NOT NULL DEFAULT 500000,
      last_used_at TIMESTAMPTZ,
      pending_k1 TEXT,
      pending_k1_expires_at TIMESTAMPTZ,
      provision_token TEXT,
      provision_token_expires_at TIMESTAMPTZ,
      wipe_token TEXT,
      wipe_token_expires_at TIMESTAMPTZ,
      pin_hash TEXT,
      pin_limit_msats BIGINT,
      pin_fail_count INTEGER NOT NULL DEFAULT 0,
      pin_locked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id),
      direction transaction_direction NOT NULL,
      amount_sats BIGINT NOT NULL,
      fee_sats BIGINT NOT NULL DEFAULT 0,
      type transaction_type NOT NULL,
      counterpart_handle TEXT,
      counterpart_ln_address TEXT,
      bolt11 TEXT,
      payment_hash TEXT,
      status transaction_status NOT NULL DEFAULT 'completed',
      memo TEXT,
      card_id UUID REFERENCES cards(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pending_invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id),
      bolt11 TEXT NOT NULL,
      payment_hash TEXT NOT NULL UNIQUE,
      amount_sats BIGINT NOT NULL,
      memo TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS card_designs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      artist TEXT,
      preview_url TEXT NOT NULL DEFAULT '',
      price_eur_cents INTEGER NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS card_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id),
      remote_order_id TEXT,
      design_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      quantity INTEGER NOT NULL DEFAULT 1,
      shipping_name TEXT NOT NULL,
      shipping_email TEXT,
      shipping_phone TEXT,
      shipping_address1 TEXT NOT NULL,
      shipping_address2 TEXT,
      shipping_city TEXT NOT NULL,
      shipping_postal_code TEXT NOT NULL,
      shipping_country TEXT NOT NULL,
      tracking_number TEXT,
      amount_sats INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    DO $$ BEGIN
      CREATE TYPE pin_session_status AS ENUM (
        'pending', 'processing', 'authorized', 'expired', 'failed'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS pin_payment_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      card_id UUID NOT NULL REFERENCES cards(id),
      account_id UUID NOT NULL REFERENCES accounts(id),
      pr TEXT NOT NULL,
      amount_sats BIGINT NOT NULL,
      fee_sats BIGINT NOT NULL,
      card_label TEXT,
      status pin_session_status NOT NULL DEFAULT 'pending',
      pin_fail_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
