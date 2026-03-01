import { NextRequest, NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { listSessions, createSession } from "@/lib/db/queries"

export const runtime = 'edge'

export async function GET() {
  const db = await createDb()
  const rows = await listSessions(db)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const db = await createDb()
  const body = (await req.json()) as { provider?: string }
  const session = await createSession(db, {
    provider: body.provider ?? "gemini",
  })
  return NextResponse.json(session, { status: 201 })
}
