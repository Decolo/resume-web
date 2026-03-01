import { describe, test, expect, beforeEach } from "vitest"
import Database from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { eq } from "drizzle-orm"
import { sessions } from "./schema"
import type * as schema from "./schema"
import {
  createResume,
  getResumesBySession,
  getResumeBySession,
  getResumeById,
  updateResume,
  upsertResumeBySession,
  deleteResume,
  migrateResumesFromSessions,
} from "./resumes"

let db: BetterSQLite3Database<typeof schema>

beforeEach(async () => {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  db = drizzle(sqlite)

  sqlite.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      resume_json TEXT,
      jd_text TEXT,
      workflow_state TEXT NOT NULL DEFAULT 'draft',
      provider TEXT NOT NULL DEFAULT 'gemini',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE resumes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `)
})

async function createTestSession(id = "sess_test") {
  await db.insert(sessions).values({
    id,
    resumeJson: null,
    jdText: null,
    workflowState: "draft",
    provider: "gemini",
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

async function deleteSession(id: string) {
  await db.delete(sessions).where(eq(sessions.id, id))
}

describe("Resume CRUD operations", () => {
  test("creates one resume in a session", async () => {
    const sessionId = await createTestSession()

    const resume = await createResume(db, {
      sessionId,
      title: "Software Engineer Resume",
      content: JSON.stringify({ basics: { name: "John Doe" } }),
    })

    expect(resume.id).toBeDefined()
    expect(resume.sessionId).toBe(sessionId)
    expect(resume.title).toBe("Software Engineer Resume")
    expect(resume.content).toContain("John Doe")
  })

  test("resumes are isolated by session", async () => {
    const session1 = await createTestSession("sess_001")
    const session2 = await createTestSession("sess_002")

    await upsertResumeBySession(db, {
      sessionId: session1,
      title: "Resume A",
      content: "{}",
    })
    await upsertResumeBySession(db, {
      sessionId: session2,
      title: "Resume B",
      content: "{}",
    })

    const r1 = await getResumeBySession(db, session1)
    const r2 = await getResumeBySession(db, session2)

    expect(r1?.title).toBe("Resume A")
    expect(r2?.title).toBe("Resume B")
    expect(r1?.id).not.toBe(r2?.id)
  })

  test("upsert keeps one record per session and updates content", async () => {
    const sessionId = await createTestSession()

    const first = await upsertResumeBySession(db, {
      sessionId,
      title: "Resume",
      content: JSON.stringify({ basics: { name: "Jane" } }),
    })
    const second = await upsertResumeBySession(db, {
      sessionId,
      title: "Resume v2",
      content: JSON.stringify({ basics: { name: "Jane Updated" } }),
    })

    const list = await getResumesBySession(db, sessionId)
    expect(list).toHaveLength(1)
    expect(second.id).toBe(first.id)
    expect(second.title).toBe("Resume v2")
    expect(second.content).toContain("Jane Updated")
  })

  test("deleting session cascades to resume row", async () => {
    const sessionId = await createTestSession()

    await upsertResumeBySession(db, {
      sessionId,
      title: "Resume",
      content: "{}",
    })
    await deleteSession(sessionId)

    const resume = await getResumeBySession(db, sessionId)
    expect(resume).toBeNull()
  })
})

describe("Resume updates and deletion", () => {
  test("updates resume content by id", async () => {
    const sessionId = await createTestSession()

    const resume = await createResume(db, {
      sessionId,
      title: "Original",
      content: JSON.stringify({ basics: { name: "John" } }),
    })

    const updated = await updateResume(db, resume.id, {
      content: JSON.stringify({ basics: { name: "Jane" } }),
    })

    expect(updated.content).toContain("Jane")
    expect(updated.id).toBe(resume.id)
    expect(updated.title).toBe("Original")
  })

  test("deletes individual resume", async () => {
    const sessionId = await createTestSession()

    const resume = await createResume(db, {
      sessionId,
      title: "Resume 1",
      content: "{}",
    })

    await deleteResume(db, resume.id)

    const remaining = await getResumeBySession(db, sessionId)
    expect(remaining).toBeNull()
  })

  test("gets resume by id", async () => {
    const sessionId = await createTestSession()

    const created = await createResume(db, {
      sessionId,
      title: "Test Resume",
      content: "{}",
    })

    const found = await getResumeById(db, created.id)
    expect(found).not.toBeNull()
    expect(found?.id).toBe(created.id)
    expect(found?.title).toBe("Test Resume")
  })
})

describe("Edge cases", () => {
  test("empty session returns null", async () => {
    const resume = await getResumeBySession(db, "nonexistent_session")
    expect(resume).toBeNull()
  })

  test("getting nonexistent resume by id returns null", async () => {
    const resume = await getResumeById(db, "nonexistent_id")
    expect(resume).toBeNull()
  })

  test("cannot create resume for nonexistent session", async () => {
    await expect(
      createResume(db, {
        sessionId: "nonexistent_session",
        title: "Test",
        content: "{}",
      })
    ).rejects.toThrow()
  })

  test("cannot create a second resume row for same session", async () => {
    const sessionId = await createTestSession()
    await createResume(db, { sessionId, title: "Resume 1", content: "{}" })

    await expect(
      createResume(db, { sessionId, title: "Resume 2", content: "{}" })
    ).rejects.toThrow()
  })
})

describe("Data migration", () => {
  test("migrates legacy sessions.resume_json into singleton resumes row", async () => {
    await db.insert(sessions).values({
      id: "sess_old",
      resumeJson: JSON.stringify({ basics: { name: "Old Resume" } }),
      jdText: null,
      workflowState: "draft",
      provider: "gemini",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await migrateResumesFromSessions(db)

    const migrated = await getResumeBySession(db, "sess_old")
    expect(migrated).not.toBeNull()
    expect(migrated?.title).toBe("Imported Resume")
    expect(migrated?.content).toContain("Old Resume")
  })

  test("migration updates existing row instead of creating duplicates", async () => {
    await db.insert(sessions).values({
      id: "sess_existing",
      resumeJson: JSON.stringify({ basics: { name: "Legacy Value" } }),
      jdText: null,
      workflowState: "draft",
      provider: "gemini",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await createResume(db, {
      sessionId: "sess_existing",
      title: "Current Resume",
      content: JSON.stringify({ basics: { name: "Current Value" } }),
    })

    await migrateResumesFromSessions(db)

    const list = await getResumesBySession(db, "sess_existing")
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe("Imported Resume")
    expect(list[0].content).toContain("Legacy Value")
  })
})
