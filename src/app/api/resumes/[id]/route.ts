import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { updateResume, getResumeById, deleteResume } from "@/lib/db/resumes"

// Note: Using Node.js runtime for local dev (better-sqlite3 compatibility)

const updateResumeSchema = z
  .object({
    title: z.string().optional(),
    content: z.string().optional(),
  })
  .strict()

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = await createDb()
    const body = updateResumeSchema.parse(await req.json())

    const existing = await getResumeById(db, id)
    if (!existing) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 })
    }

    const updated = await updateResume(db, id, body)
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", details: error.issues },
        { status: 400 }
      )
    }
    console.error("Error updating resume:", error)
    return NextResponse.json(
      { error: "Failed to update resume" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = await createDb()
    const existing = await getResumeById(db, id)
    if (!existing) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 })
    }
    await deleteResume(db, id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("Error deleting resume:", error)
    return NextResponse.json(
      { error: "Failed to delete resume" },
      { status: 500 }
    )
  }
}
