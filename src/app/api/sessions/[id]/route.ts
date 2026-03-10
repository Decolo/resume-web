import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { getSession, updateSession, deleteSession } from "@/lib/db/queries"
import { createLogger, getRequestId } from "@/lib/logger"

// Note: Using Node.js runtime for local dev (better-sqlite3 compatibility)

const updateSessionSchema = z.object({
  resumeJson: z.string().optional(),
  jdText: z.string().optional(),
  workflowState: z.string().optional(),
  provider: z.enum(["openai", "gemini"]).optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const log = createLogger({ route: `/api/sessions/${id}`, requestId: getRequestId(req.headers) })
  try {
    const db = await log.time("db.connect", () => createDb())
    const session = await log.time("db.getSession", () => getSession(db, id))
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(session)
  } catch (error) {
    log.error("Failed to get session", error)
    return NextResponse.json({ error: "Failed to get session" }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const log = createLogger({ route: `/api/sessions/${id}`, requestId: getRequestId(req.headers) })

  try {
    const body = await req.json()
    const validated = updateSessionSchema.parse(body)
    const db = await log.time("db.connect", () => createDb())
    const session = await log.time("db.updateSession", () => updateSession(db, id, validated))
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(session)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", details: error.issues },
        { status: 400 }
      )
    }
    log.error("Failed to update session", error)
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const log = createLogger({ route: `/api/sessions/${id}`, requestId: getRequestId(req.headers) })
  try {
    const db = await log.time("db.connect", () => createDb())
    await log.time("db.deleteSession", () => deleteSession(db, id))
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    log.error("Failed to delete session", error)
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 })
  }
}
