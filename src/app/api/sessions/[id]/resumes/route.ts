import { NextRequest, NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { getResumesBySession, migrateResumesFromSessions } from "@/lib/db/resumes"
import { createLogger, getRequestId } from "@/lib/logger"

// Note: Using Node.js runtime for local dev (better-sqlite3 compatibility)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const log = createLogger({ route: `/api/sessions/${id}/resumes`, requestId: getRequestId(req.headers) })
  try {
    const db = await log.time("db.connect", () => createDb())
    await log.time("db.migrateResumes", () => migrateResumesFromSessions(db))
    const resumes = await log.time("db.getResumesBySession", () => getResumesBySession(db, id))
    return NextResponse.json(resumes)
  } catch (error) {
    log.error("Failed to fetch resumes", error)
    return NextResponse.json(
      { error: "Failed to fetch resumes" },
      { status: 500 }
    )
  }
}
