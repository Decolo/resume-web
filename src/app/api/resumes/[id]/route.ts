import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { updateResume, getResumeById, deleteResume } from "@/lib/db/resumes"
import { createLogger, getRequestId } from "@/lib/logger"

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
  const { id } = await params
  const log = createLogger({ route: `/api/resumes/${id}`, requestId: getRequestId(req.headers) })
  try {
    const db = await log.time("db.connect", () => createDb())
    const body = updateResumeSchema.parse(await req.json())

    const existing = await log.time("db.getResumeById", () => getResumeById(db, id))
    if (!existing) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 })
    }

    const updated = await log.time("db.updateResume", () => updateResume(db, id, body))
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", details: error.issues },
        { status: 400 }
      )
    }
    log.error("Failed to update resume", error)
    return NextResponse.json(
      { error: "Failed to update resume" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const log = createLogger({ route: `/api/resumes/${id}`, requestId: getRequestId(req.headers) })
  try {
    const db = await log.time("db.connect", () => createDb())
    const existing = await log.time("db.getResumeById", () => getResumeById(db, id))
    if (!existing) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 })
    }
    await log.time("db.deleteResume", () => deleteResume(db, id))
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    log.error("Failed to delete resume", error)
    return NextResponse.json(
      { error: "Failed to delete resume" },
      { status: 500 }
    )
  }
}
