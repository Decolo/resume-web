import { NextRequest, NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { messages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { createLogger, getRequestId } from "@/lib/logger"

// Note: Using Node.js runtime for local dev (better-sqlite3 compatibility)

const SNAPSHOT_ID_SUFFIX = "__chat_snapshot"

function snapshotId(sessionId: string) {
  return `${sessionId}${SNAPSHOT_ID_SUFFIX}`
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params
  const log = createLogger({ route: `/api/sessions/${sessionId}/messages`, requestId: getRequestId(req.headers) })
  try {
    const db = await log.time("db.connect", () => createDb())
    const id = snapshotId(sessionId)
    const rows = await log.time("db.fetchMessages", async () =>
      db.select().from(messages).where(eq(messages.id, id)).all(),
    )
    if (rows.length === 0) return NextResponse.json([])

    try {
      const parsed = JSON.parse(rows[0].content)
      return NextResponse.json(Array.isArray(parsed) ? parsed : [])
    } catch {
      // Recover from malformed legacy/corrupted snapshots instead of looping retries on 500.
      log.warn("Corrupted snapshot, deleting", { snapshotId: id })
      await db.delete(messages).where(eq(messages.id, id))
      return NextResponse.json([])
    }
  } catch (error) {
    log.error("Failed to fetch messages", error)
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params
  const log = createLogger({ route: `/api/sessions/${sessionId}/messages`, requestId: getRequestId(req.headers) })
  try {
    const uiMessages = await req.json()
    const db = await log.time("db.connect", () => createDb())
    const id = snapshotId(sessionId)

    if (!Array.isArray(uiMessages)) {
      return NextResponse.json({ error: "Invalid messages payload" }, { status: 400 })
    }

    if (uiMessages.length === 0) {
      // Defensive no-op: ignore empty snapshots to avoid deleting valid history on client races.
      return NextResponse.json({ ok: true })
    }

    // Upsert: delete + insert
    await log.time("db.upsertMessages", async () => {
      await db.delete(messages).where(eq(messages.id, id))
      await db.insert(messages).values({
        id,
        sessionId,
        role: "user",
        content: JSON.stringify(uiMessages),
        createdAt: new Date(),
      })
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    log.error("Failed to save messages", error)
    return NextResponse.json({ error: "Failed to save messages" }, { status: 500 })
  }
}
