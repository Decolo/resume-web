import { NextRequest, NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { updateResume, getResumeById } from "@/lib/db/resumes"

// Note: Using Node.js runtime for local dev (better-sqlite3 compatibility)

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = await createDb()
    const body = (await req.json()) as { title?: string; content?: string }

    const existing = await getResumeById(db, id)
    if (!existing) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 })
    }

    const updated = await updateResume(db, id, body)
    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating resume:", error)
    return NextResponse.json(
      { error: "Failed to update resume" },
      { status: 500 }
    )
  }
}
