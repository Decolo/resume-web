import { desc, eq, isNotNull } from "drizzle-orm"
import type { Database } from "./index"
import { resumes, type Resume, type NewResume } from "./schema"

export interface CreateResumeInput {
  sessionId: string
  title: string
  content: string
}

export interface UpdateResumeInput {
  title?: string
  content?: string
}

export async function createResume(
  db: Database,
  input: CreateResumeInput
): Promise<Resume> {
  const id = crypto.randomUUID()
  const now = new Date()

  const newResume: NewResume = {
    id,
    sessionId: input.sessionId,
    title: input.title,
    content: input.content,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(resumes).values(newResume)

  return {
    ...newResume,
    createdAt: now,
    updatedAt: now,
  }
}

export async function getResumesBySession(
  db: Database,
  sessionId: string
): Promise<Resume[]> {
  return db
    .select()
    .from(resumes)
    .where(eq(resumes.sessionId, sessionId))
    .orderBy(desc(resumes.updatedAt), desc(resumes.createdAt), desc(resumes.id))
    .all()
}

/**
 * Backwards-compatible helper.
 * Returns the most recently updated resume in a session.
 */
export async function getResumeBySession(
  db: Database,
  sessionId: string
): Promise<Resume | null> {
  const list = await getResumesBySession(db, sessionId)
  return list[0] ?? null
}

export async function getResumeById(
  db: Database,
  id: string
): Promise<Resume | null> {
  const results = await db.select().from(resumes).where(eq(resumes.id, id)).all()
  return results[0] || null
}

export async function updateResume(
  db: Database,
  id: string,
  input: UpdateResumeInput
): Promise<Resume> {
  const updates: Partial<NewResume> = {
    ...input,
    updatedAt: new Date(),
  }

  await db.update(resumes).set(updates).where(eq(resumes.id, id))

  const updated = await getResumeById(db, id)
  if (!updated) {
    throw new Error(`Resume ${id} not found`)
  }

  return updated
}

export async function deleteResume(
  db: Database,
  id: string
): Promise<void> {
  await db.delete(resumes).where(eq(resumes.id, id))
}

/**
 * Migrate existing resume_json from sessions table to resumes table
 * This is a one-time migration function
 */
export async function migrateResumesFromSessions(
  db: Database
): Promise<void> {
  const { sessions: sessionsTable } = await import("./schema")

  // Get all sessions with resume_json
  const sessionsWithResumes = await db
    .select()
    .from(sessionsTable)
    .where(isNotNull(sessionsTable.resumeJson))
    .all()

  for (const session of sessionsWithResumes) {
    if (!session.resumeJson) continue
    const existing = await getResumesBySession(db, session.id)
    if (existing.length > 0) continue

    await createResume(db, {
      sessionId: session.id,
      title: "Imported Resume",
      content: session.resumeJson,
    })
  }
}
