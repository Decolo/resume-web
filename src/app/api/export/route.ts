import { NextRequest, NextResponse } from "next/server"
import { markdownToHtml, markdownToJsonResume } from "@/lib/domain/resume-writer"
import { jsonResumeToText } from "@/lib/domain/resume-parser"
import { createLogger, getRequestId } from "@/lib/logger"

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const log = createLogger({ route: "/api/export", requestId: getRequestId(req.headers) })

  try {
    const body = (await req.json()) as {
      content: string
      format: "html" | "json" | "text"
    }

    if (!body.content || !body.format) {
      return NextResponse.json(
        { error: "content and format are required" },
        { status: 400 },
      )
    }

    log.info("Exporting resume", { format: body.format })

    switch (body.format) {
      case "html": {
        const html = markdownToHtml(body.content)
        return new NextResponse(html, {
          headers: {
            "Content-Type": "text/html",
            "Content-Disposition": 'attachment; filename="resume.html"',
          },
        })
      }
      case "json": {
        const json = markdownToJsonResume(body.content)
        return new NextResponse(json, {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": 'attachment; filename="resume.json"',
          },
        })
      }
      case "text": {
        try {
          const parsed = JSON.parse(body.content)
          const { text } = jsonResumeToText(parsed)
          return new NextResponse(text, {
            headers: {
              "Content-Type": "text/plain",
              "Content-Disposition": 'attachment; filename="resume.txt"',
            },
          })
        } catch {
          return new NextResponse(body.content, {
            headers: {
              "Content-Type": "text/plain",
              "Content-Disposition": 'attachment; filename="resume.txt"',
            },
          })
        }
      }
      default:
        return NextResponse.json({ error: "Unsupported format" }, { status: 400 })
    }
  } catch (error) {
    log.error("Export failed", error)
    return NextResponse.json(
      { error: "Export failed" },
      { status: 500 },
    )
  }
}
