import { NextRequest, NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { getResumesBySession } from "@/lib/db/resumes"

// Note: Using Node.js runtime for local dev (better-sqlite3 compatibility)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = await createDb()
    const resumes = await getResumesBySession(db, id)
    return NextResponse.json(resumes)
  } catch (error) {
    console.error("Error fetching resumes:", error)
    return NextResponse.json(
      { error: "Failed to fetch resumes" },
      { status: 500 }
    )
  }
}
