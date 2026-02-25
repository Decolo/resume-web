import { NextRequest, NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { listSessions, createSession } from "@/lib/db/queries"

function getDb(req: NextRequest) {
  const d1 = (req as unknown as { env?: { DB?: D1Database } }).env?.DB
  return createDb(d1)
}

export async function GET(req: NextRequest) {
  const db = getDb(req)
  const rows = await listSessions(db)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const db = getDb(req)
  const body = (await req.json()) as { provider?: string }
  const session = await createSession(db, {
    provider: body.provider ?? "gemini",
  })
  return NextResponse.json(session, { status: 201 })
}
