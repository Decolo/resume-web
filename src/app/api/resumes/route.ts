import { NextRequest, NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { createResume } from "@/lib/db/resumes"
import { createLogger, getRequestId } from "@/lib/logger"

// Note: Using Node.js runtime for local dev (better-sqlite3 compatibility)

export async function POST(req: NextRequest) {
  const log = createLogger({ route: "/api/resumes", requestId: getRequestId(req.headers) })
  try {
    const db = await log.time("db.connect", () => createDb())
    const body = (await req.json()) as {
      sessionId: string
      title: string
      content: string
    }

    if (!body.sessionId || !body.title || !body.content) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, title, content" },
        { status: 400 }
      )
    }

    const resume = await log.time("db.createResume", () =>
      createResume(db, {
        sessionId: body.sessionId,
        title: body.title,
        content: body.content,
      }),
    )

    return NextResponse.json(resume, { status: 201 })
  } catch (error) {
    log.error("Failed to create resume", error)
    return NextResponse.json(
      { error: "Failed to create resume" },
      { status: 500 }
    )
  }
}
