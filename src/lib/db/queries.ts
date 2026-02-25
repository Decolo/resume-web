import { eq, desc } from "drizzle-orm";
import type { Database } from "./index";
import { sessions, messages } from "./schema";
import type { Session, NewSession, Message } from "./schema";

// --------------- Sessions ---------------

export async function createSession(
  db: Database,
  data: Omit<NewSession, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<Session> {
  const id = data.id ?? crypto.randomUUID();
  const now = new Date();
  const [row] = await db
    .insert(sessions)
    .values({ ...data, id, createdAt: now, updatedAt: now })
    .returning();
  return row;
}

export async function getSession(
  db: Database,
  id: string
): Promise<Session | undefined> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);
  return row;
}

export async function updateSession(
  db: Database,
  id: string,
  data: Partial<Pick<Session, "resumeJson" | "jdText" | "workflowState" | "provider">>
): Promise<Session | undefined> {
  const [row] = await db
    .update(sessions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(sessions.id, id))
    .returning();
  return row;
}

export async function listSessions(db: Database): Promise<Session[]> {
  return db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.updatedAt));
}

export async function deleteSession(
  db: Database,
  id: string
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}

// --------------- Messages ---------------

export async function addMessage(
  db: Database,
  sessionId: string,
  role: Message["role"],
  content: string,
  toolCalls?: string
): Promise<Message> {
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(messages)
    .values({ id, sessionId, role, content, toolCalls, createdAt: new Date() })
    .returning();
  return row;
}

export async function getMessages(
  db: Database,
  sessionId: string
): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(messages.createdAt);
}
