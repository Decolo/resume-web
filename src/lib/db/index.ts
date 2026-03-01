import { getOptionalRequestContext } from "@cloudflare/next-on-pages";
import { drizzle as drizzleD1, DrizzleD1Database } from "drizzle-orm/d1";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type Database = DrizzleD1Database<typeof schema> | BetterSQLite3Database<typeof schema>;

let localDb: BetterSQLite3Database<typeof schema> | null = null;

// Check if we're in Edge Runtime
const isEdgeRuntime = typeof EdgeRuntime !== 'undefined' || process.env.NEXT_RUNTIME === 'edge';

async function getLocalDb(): Promise<BetterSQLite3Database<typeof schema>> {
  if (isEdgeRuntime) {
    throw new Error("Cannot use better-sqlite3 in Edge Runtime. D1 database not available.");
  }
  if (localDb) return localDb;
  const { default: BetterSqlite3 } = await import("better-sqlite3");
  const { drizzle: drizzleSqlite } = await import("drizzle-orm/better-sqlite3");
  const sqlite = new BetterSqlite3("local.db");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      resume_json TEXT,
      jd_text TEXT,
      workflow_state TEXT NOT NULL DEFAULT 'draft',
      provider TEXT NOT NULL DEFAULT 'gemini',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  localDb = drizzleSqlite(sqlite, { schema });
  return localDb;
}

export async function createDb(): Promise<Database> {
  // In Cloudflare Pages, get D1 from request context
  try {
    const ctx = getOptionalRequestContext();
    const d1 = ctx?.env?.DB;
    if (d1) return drizzleD1(d1, { schema });
  } catch {
    // Not in edge runtime (local dev) — fall through to local SQLite
  }
  return getLocalDb();
}

export { schema };
