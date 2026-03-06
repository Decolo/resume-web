import { getOptionalRequestContext } from "@cloudflare/next-on-pages";
import { drizzle as drizzleD1, DrizzleD1Database } from "drizzle-orm/d1";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type Database = DrizzleD1Database<typeof schema> | BetterSQLite3Database<typeof schema>;

let localDb: BetterSQLite3Database<typeof schema> | null = null;
let localResumeSchemaEnsured = false;
let d1ResumeSchemaEnsured = false;

const RESUMES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS resumes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

const RESUMES_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS resumes_session_id_idx
ON resumes(session_id);
`;

const RESUMES_REBUILD_SQL = [
  "DROP TABLE IF EXISTS resumes__new;",
  `
CREATE TABLE resumes__new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`,
  `
INSERT INTO resumes__new (id, session_id, title, content, created_at, updated_at)
SELECT id, session_id, title, content, created_at, updated_at
FROM resumes;
`,
  "DROP TABLE resumes;",
  "ALTER TABLE resumes__new RENAME TO resumes;",
];

function hasLegacySingletonConstraint(createSql: string | null): boolean {
  if (!createSql) return false;
  const normalized = createSql.toLowerCase().replace(/\s+/g, " ");
  return normalized.includes("session_id text not null unique");
}

function ensureLocalResumeSchema(sqlite: {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => { get: (name: string) => { sql?: string } | undefined };
}) {
  if (localResumeSchemaEnsured) return;

  const row = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get("resumes");

  if (hasLegacySingletonConstraint(row?.sql ?? null)) {
    sqlite.exec("PRAGMA foreign_keys = OFF;");
    try {
      for (const sql of RESUMES_REBUILD_SQL) {
        sqlite.exec(sql);
      }
    } finally {
      sqlite.exec("PRAGMA foreign_keys = ON;");
    }
  }

  sqlite.exec(RESUMES_TABLE_SQL);
  sqlite.exec(RESUMES_INDEX_SQL);
  localResumeSchemaEnsured = true;
}

async function ensureD1ResumeSchema(d1: D1Database) {
  if (d1ResumeSchemaEnsured) return;

  const tableRow = await d1
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'resumes'")
    .first<{ sql?: string }>();

  if (hasLegacySingletonConstraint(tableRow?.sql ?? null)) {
    for (const sql of RESUMES_REBUILD_SQL) {
      await d1.prepare(sql).run();
    }
  }

  await d1.prepare(RESUMES_TABLE_SQL).run();
  await d1.prepare(RESUMES_INDEX_SQL).run();
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
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
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
