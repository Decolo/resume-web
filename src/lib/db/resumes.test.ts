import { describe, test, expect, beforeEach } from "vitest"
import Database from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { eq } from "drizzle-orm"
import { sessions, resumes } from "./schema"
import type * as schema from "./schema"
import {
  createResume,
  getResumesBySession,
  getResumeBySession,
  getResumeById,
  updateResume,
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
      session_id TEXT NOT NULL,
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

  test("allows multiple resumes in one session", async () => {
    const sessionId = await createTestSession()

    await createResume(db, {
      sessionId,
      title: "Resume A",
      content: JSON.stringify({ basics: { name: "Alice" } }),
    })
    await createResume(db, {
      sessionId,
      title: "Resume B",
      content: JSON.stringify({ basics: { name: "Bob" } }),
    })

    const list = await getResumesBySession(db, sessionId)
    expect(list).toHaveLength(2)
    expect(list.map((r) => r.title)).toEqual(expect.arrayContaining(["Resume A", "Resume B"]))
  })

  test("resumes are isolated by session", async () => {
    const session1 = await createTestSession("sess_001")
    const session2 = await createTestSession("sess_002")

    await createResume(db, {
      sessionId: session1,
      title: "Resume A",
      content: "{}",
    })
    await createResume(db, {
      sessionId: session2,
      title: "Resume B",
      content: "{}",
    })

    const r1 = await getResumesBySession(db, session1)
    const r2 = await getResumesBySession(db, session2)

    expect(r1).toHaveLength(1)
    expect(r2).toHaveLength(1)
    expect(r1[0].title).toBe("Resume A")
    expect(r2[0].title).toBe("Resume B")
    expect(r1[0].id).not.toBe(r2[0].id)
  })

  test("deleting session cascades to all its resumes", async () => {
    const sessionId = await createTestSession()

    await createResume(db, {
      sessionId,
      title: "Resume 1",
      content: "{}",
    })
    await createResume(db, {
      sessionId,
      title: "Resume 2",
      content: "{}",
    })

    await deleteSession(sessionId)

    const list = await getResumesBySession(db, sessionId)
    expect(list).toHaveLength(0)
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

  test("deletes individual resume and keeps others", async () => {
    const sessionId = await createTestSession()

    const r1 = await createResume(db, {
      sessionId,
      title: "Resume 1",
      content: "{}",
    })
    await createResume(db, {
      sessionId,
      title: "Resume 2",
      content: "{}",
    })

    await deleteResume(db, r1.id)

    const remaining = await getResumesBySession(db, sessionId)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].title).toBe("Resume 2")
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

  test("getResumeBySession returns the latest updated resume", async () => {
    const sessionId = await createTestSession()

    const first = await createResume(db, {
      sessionId,
      title: "First",
      content: "{}",
    })
    const second = await createResume(db, {
      sessionId,
      title: "Second",
      content: "{}",
    })

    await db
      .update(resumes)
      .set({
        title: "First (Updated)",
        updatedAt: new Date(Date.now() + 60_000),
      })
      .where(eq(resumes.id, first.id))

    const latest = await getResumeBySession(db, sessionId)
    expect(latest).not.toBeNull()
    expect(latest?.id).toBe(first.id)
    expect(latest?.title).toBe("First (Updated)")
    expect(latest?.id).not.toBe(second.id)
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
})

describe("Data migration", () => {
  test("migrates legacy sessions.resume_json into resumes table", async () => {
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

    const migrated = await getResumesBySession(db, "sess_old")
    expect(migrated).toHaveLength(1)
    expect(migrated[0].title).toBe("Imported Resume")
    expect(migrated[0].content).toContain("Old Resume")
  })

  test("migration is no-op for sessions that already have resumes", async () => {
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
    expect(list[0].title).toBe("Current Resume")
    expect(list[0].content).toContain("Current Value")
  })
})
