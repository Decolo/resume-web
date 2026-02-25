import { drizzle as drizzleD1, DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle as drizzleSqlite, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
import * as schema from "./schema";

export type Database = DrizzleD1Database<typeof schema> | BetterSQLite3Database<typeof schema>;

let localDb: BetterSQLite3Database<typeof schema> | null = null;

function getLocalDb(): BetterSQLite3Database<typeof schema> {
  if (localDb) return localDb;
  const sqlite = new BetterSqlite3("local.db");
  sqlite.pragma("journal_mode = WAL");
  // Auto-create tables in dev
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

export function createDb(d1?: D1Database): Database {
  if (d1) return drizzleD1(d1, { schema });
  return getLocalDb();
}

export { schema };
