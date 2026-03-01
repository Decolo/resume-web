import { NextRequest, NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { upsertResumeBySession } from "@/lib/db/resumes"

// Note: Using Node.js runtime for local dev (better-sqlite3 compatibility)

export async function POST(req: NextRequest) {
  try {
    const db = await createDb()
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

    const resume = await upsertResumeBySession(db, {
      sessionId: body.sessionId,
      title: body.title,
      content: body.content,
    })

    return NextResponse.json(resume, { status: 201 })
  } catch (error) {
    console.error("Error creating resume:", error)
    return NextResponse.json(
      { error: "Failed to create resume" },
      { status: 500 }
    )
  }
}
