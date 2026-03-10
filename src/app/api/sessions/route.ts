import { NextRequest, NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { listSessions, createSession } from "@/lib/db/queries"
import { createLogger, getRequestId } from "@/lib/logger"

// Note: Using Node.js runtime for local dev (better-sqlite3 compatibility)
// In production (Cloudflare Pages), this will be overridden by wrangler config

export async function GET(req: NextRequest) {
  const log = createLogger({ route: "/api/sessions", requestId: getRequestId(req.headers) })
  try {
    const db = await log.time("db.connect", () => createDb())
    const rows = await log.time("db.listSessions", () => listSessions(db))
    return NextResponse.json(rows)
  } catch (error) {
    log.error("Failed to list sessions", error)
    return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const log = createLogger({ route: "/api/sessions", requestId: getRequestId(req.headers) })
  try {
    const db = await log.time("db.connect", () => createDb())
    const body = (await req.json()) as { provider?: string }
    const session = await log.time("db.createSession", () =>
      createSession(db, { provider: body.provider ?? "gemini" }),
    )
    return NextResponse.json(session, { status: 201 })
  } catch (error) {
    log.error("Failed to create session", error)
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 })
  }
}
