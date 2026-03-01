import { getOptionalRequestContext } from "@cloudflare/next-on-pages";
import { drizzle as drizzleD1, DrizzleD1Database } from "drizzle-orm/d1";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type Database = DrizzleD1Database<typeof schema> | BetterSQLite3Database<typeof schema>;

let localDb: BetterSQLite3Database<typeof schema> | null = null;
let localResumeSchemaEnsured = false;
let d1ResumeSchemaEnsured = false;

const RESUMES_DEDUPE_SQL = `
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY session_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM resumes
)
DELETE FROM resumes
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
`;

const RESUMES_UNIQUE_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS resumes_session_id_unique
ON resumes(session_id);
`;

function ensureLocalResumeSchema(sqlite: { exec: (sql: string) => unknown }) {
  if (localResumeSchemaEnsured) return;
  sqlite.exec(RESUMES_DEDUPE_SQL);
  sqlite.exec(RESUMES_UNIQUE_INDEX_SQL);
  localResumeSchemaEnsured = true;
}

async function ensureD1ResumeSchema(d1: D1Database) {
  if (d1ResumeSchemaEnsured) return;
  await d1.prepare(RESUMES_DEDUPE_SQL).run();
  await d1.prepare(RESUMES_UNIQUE_INDEX_SQL).run();
  d1ResumeSchemaEnsured = true;
}

async function getLocalDb(): Promise<BetterSQLite3Database<typeof schema>> {
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
    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
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
  ensureLocalResumeSchema(sqlite);
  localDb = drizzleSqlite(sqlite, { schema });
  return localDb;
}

export async function createDb(): Promise<Database> {
  // In Cloudflare Pages, get D1 from request context
  try {
    const ctx = getOptionalRequestContext();
    const d1 = ctx?.env?.DB;
    if (d1) {
      await ensureD1ResumeSchema(d1);
      return drizzleD1(d1, { schema });
    }
  } catch {
    // Not in edge runtime (local dev) — fall through to local SQLite
  }
  return getLocalDb();
}

export { schema };
