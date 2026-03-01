import { NextRequest, NextResponse } from "next/server"
import { uploadFile } from "@/lib/storage/r2"
import { createDb } from "@/lib/db"
import { updateSession } from "@/lib/db/queries"
import { getOptionalRequestContext } from "@cloudflare/next-on-pages"

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  const ctx = getOptionalRequestContext()
  const bucket = ctx?.env?.R2 as R2Bucket | undefined
  const formData = await req.formData()
  const sessionId = formData.get("sessionId") as string
  const file = formData.get("file") as File | null

  if (!sessionId || !file) {
    return NextResponse.json(
      { error: "sessionId and file are required" },
      { status: 400 },
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
      { status: 413 },
    )
  }

  const allowedExtensions = [".json", ".md", ".txt"]
  const hasAllowedExtension = allowedExtensions.some(ext => file.name.endsWith(ext))
  if (!hasAllowedExtension) {
    return NextResponse.json(
      { error: "Unsupported file format. Please upload .json, .md, or .txt" },
      { status: 400 },
    )
  }

  const buffer = await file.arrayBuffer()

  if (bucket) {
    await uploadFile(bucket, sessionId, file.name, buffer)
  }

  const text = new TextDecoder().decode(buffer)
  let resumeJson: Record<string, unknown> | null = null

  if (file.name.endsWith(".json")) {
    try {
      resumeJson = JSON.parse(text)
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON format" },
        { status: 400 },
      )
    }
  } else if (file.name.endsWith(".md") || file.name.endsWith(".txt")) {
    resumeJson = {
      basics: { name: "Uploaded Resume" },
      rawContent: text,
    }
  }

  const db = await createDb()
  await updateSession(db, sessionId, {
    resumeJson: JSON.stringify(resumeJson),
  })

  return NextResponse.json(
    {
      filename: file.name,
      sessionId,
      resumeJson,
    },
    { status: 201 }
  )
}
