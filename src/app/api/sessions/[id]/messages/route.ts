import { NextRequest, NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { messages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

const SNAPSHOT_ID_SUFFIX = "__chat_snapshot"

function snapshotId(sessionId: string) {
  return `${sessionId}${SNAPSHOT_ID_SUFFIX}`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params
    const db = await createDb()
    const id = snapshotId(sessionId)
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .all()
    if (rows.length === 0) return NextResponse.json([])

    try {
      const parsed = JSON.parse(rows[0].content)
      return NextResponse.json(Array.isArray(parsed) ? parsed : [])
    } catch {
      // Recover from malformed legacy/corrupted snapshots instead of looping retries on 500.
      await db.delete(messages).where(eq(messages.id, id))
      return NextResponse.json([])
    }
  } catch (error) {
    console.error("Error fetching messages:", error)
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params
    const uiMessages = await req.json()
    const db = await createDb()
    const id = snapshotId(sessionId)

    if (!Array.isArray(uiMessages)) {
      return NextResponse.json({ error: "Invalid messages payload" }, { status: 400 })
    }

    if (uiMessages.length === 0) {
      // Defensive no-op: ignore empty snapshots to avoid deleting valid history on client races.
      return NextResponse.json({ ok: true })
    }

    // Upsert: delete + insert
    await db.delete(messages).where(eq(messages.id, id))
    await db.insert(messages).values({
      id,
      sessionId,
      role: "user",
      content: JSON.stringify(uiMessages),
      createdAt: new Date(),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error saving messages:", error)
    return NextResponse.json({ error: "Failed to save messages" }, { status: 500 })
  }
}
