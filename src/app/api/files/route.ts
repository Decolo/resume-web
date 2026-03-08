import { NextRequest, NextResponse } from "next/server"
import { uploadFile } from "@/lib/storage/r2"
import { createDb } from "@/lib/db"
import { getOptionalRequestContext } from "@cloudflare/next-on-pages"
import { createResume } from "@/lib/db/resumes"
import { generateObject, generateText } from "ai"
import { z } from "zod"
import { getModel } from "@/lib/ai/providers"

// Note: Using Node.js runtime for local dev (better-sqlite3 compatibility)

const MAX_FILE_SIZE = 5 * 1024 * 1024

const JsonResumeSchema = z.object({
  basics: z.object({
    name: z.string().optional(),
    label: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    url: z.string().optional(),
    summary: z.string().optional(),
    location: z.object({
      city: z.string().optional(),
      region: z.string().optional(),
      countryCode: z.string().optional(),
    }).optional(),
  }).optional(),
  work: z.array(z.object({
    name: z.string().optional(),
    position: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    summary: z.string().optional(),
    highlights: z.array(z.string()).optional(),
  })).optional(),
  education: z.array(z.object({
    institution: z.string().optional(),
    area: z.string().optional(),
    studyType: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })).optional(),
  skills: z.array(z.object({
    name: z.string().optional(),
    keywords: z.array(z.string()).optional(),
  })).optional(),
  projects: z.array(z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    url: z.string().optional(),
    highlights: z.array(z.string()).optional(),
  })).optional(),
})

async function parseResumeWithLLM(
  text: string,
  provider: string,
  apiKey: string,
  baseURL?: string,
  modelId?: string,
): Promise<Record<string, unknown>> {
  const model = getModel({
    provider: provider as "gemini" | "openai",
    apiKey,
    baseURL,
    modelId,
  })

  const prompt = `Extract the resume information from the following text and return ONLY a valid JSON object following the JSON Resume schema. No markdown, no explanation, just JSON.

Schema fields:
- basics: { name, label, email, phone, url, summary, location: { city, region, countryCode } }
- work: [{ name, position, startDate, endDate, summary, highlights: [] }]
- education: [{ institution, area, studyType, startDate, endDate }]
- skills: [{ name, keywords: [] }]
- projects: [{ name, description, url, highlights: [] }]

Resume text:
${text}`

  // Try generateObject first (works with Gemini/OpenAI native structured output)
  try {
    const { object } = await generateObject({
      model,
      schema: JsonResumeSchema,
      prompt,
    })
    return object as Record<string, unknown>
  } catch {
    // Fall back to generateText + manual JSON parse for providers that don't support json_schema
    const { text: raw } = await generateText({ model, prompt })
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("LLM did not return valid JSON")
    return JSON.parse(match[0]) as Record<string, unknown>
  }
}

export async function POST(req: NextRequest) {
  try {
    let bucket: R2Bucket | undefined
    try {
      const ctx = getOptionalRequestContext()
      bucket = ctx?.env?.R2 as R2Bucket | undefined
    } catch {
      // Not in edge runtime (local dev) — R2 not available
    }

    const formData = await req.formData()
    const sessionId = formData.get("sessionId") as string
    const file = formData.get("file") as File | null
    const provider = (formData.get("provider") as string) || "gemini"
    const apiKey = formData.get("apiKey") as string | null
    const baseURL = (formData.get("baseURL") as string) || undefined
    const modelId = (formData.get("modelId") as string) || undefined

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
    if (!allowedExtensions.some(ext => file.name.endsWith(ext))) {
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
    let resumeJson: Record<string, unknown>

    if (file.name.endsWith(".json")) {
      try {
        resumeJson = JSON.parse(text)
      } catch {
        return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 })
      }
    } else if (apiKey) {
      // md / txt — parse with LLM into structured JSON Resume
      resumeJson = await parseResumeWithLLM(text, provider, apiKey, baseURL, modelId)
    } else {
      // No API key — fall back to raw content
      resumeJson = { basics: { name: "Uploaded Resume" }, rawContent: text }
    }

    const db = await createDb()
    const contentStr = JSON.stringify(resumeJson)

    const resume = await createResume(db, {
      sessionId,
      title: file.name,
      content: contentStr,
    })

    return NextResponse.json({ filename: file.name, sessionId, resume, resumeJson }, { status: 201 })
  } catch (error) {
    console.error("Error in file upload:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "File upload failed" },
      { status: 500 },
    )
  }
}
