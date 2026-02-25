import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { getSession, updateSession, deleteSession } from "@/lib/db/queries"

const updateSessionSchema = z.object({
  resumeJson: z.string().optional(),
  jdText: z.string().optional(),
  workflowState: z.string().optional(),
  provider: z.enum(["openai", "gemini"]).optional(),
})

function getDb(req: NextRequest) {
  const d1 = (req as unknown as { env?: { DB?: D1Database } }).env?.DB
  return createDb(d1)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db = getDb(req)
  const session = await getSession(db, id)
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(session)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db = getDb(req)

  try {
    const body = await req.json()
    const validated = updateSessionSchema.parse(body)
    const session = await updateSession(db, id, validated)
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(session)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", details: error.issues },
        { status: 400 }
      )
    }
    throw error
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db = getDb(req)
  await deleteSession(db, id)
  return new NextResponse(null, { status: 204 })
}
