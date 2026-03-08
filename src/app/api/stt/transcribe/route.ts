import { NextResponse } from "next/server"

export const runtime = "edge"

const ELEVENLABS_TRANSCRIBE_ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text"
const DEFAULT_MODEL_ID = "scribe_v2"

interface TranscribeResult {
  text: string
  languageCode?: string
}

interface UpstreamSingleChannelResponse {
  text?: string
  language_code?: string
}

interface UpstreamMultichannelResponse {
  transcripts?: Array<{
    text?: string
    language_code?: string
  }>
}

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status })
}

function resolveEnv(name: string): string {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function extractTranscript(
  payload: UpstreamSingleChannelResponse | UpstreamMultichannelResponse | null | undefined,
): TranscribeResult {
  if (!payload || typeof payload !== "object") {
    return { text: "" }
  }

  if ("text" in payload && typeof payload.text === "string") {
    return {
      text: normalizeWhitespace(payload.text),
      languageCode: payload.language_code,
    }
  }

  if ("transcripts" in payload && Array.isArray(payload.transcripts)) {
    const texts = payload.transcripts
      .map((item) => (typeof item?.text === "string" ? normalizeWhitespace(item.text) : ""))
      .filter((item) => item.length > 0)
    const languageCode = payload.transcripts.find((item) => item?.language_code)?.language_code
    return {
      text: texts.join("\n"),
      languageCode,
    }
  }

  return { text: "" }
}

export async function POST(request: Request) {
  const apiKey = resolveEnv("ELEVENLABS_API_KEY")
  if (!apiKey) {
    return jsonError(
      "Missing ELEVENLABS_API_KEY on server",
      500,
      "missing_server_key",
    )
  }

  const modelId = resolveEnv("ELEVENLABS_STT_TRANSCRIBE_MODEL") || DEFAULT_MODEL_ID

  let body: FormData
  try {
    body = await request.formData()
  } catch {
    return jsonError("Invalid multipart form data", 400, "invalid_form_data")
  }

  const file = body.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("Missing audio file", 400, "missing_audio_file")
  }

  const languageCodeRaw = body.get("languageCode")
  const languageCode =
    typeof languageCodeRaw === "string" ? languageCodeRaw.trim() : ""

  const upstreamBody = new FormData()
  upstreamBody.append("model_id", modelId)
  upstreamBody.append("file", file)
  upstreamBody.append("tag_audio_events", "false")
  if (languageCode.length > 0) {
    upstreamBody.append("language_code", languageCode)
  }

  let upstream: Response
  try {
    upstream = await fetch(ELEVENLABS_TRANSCRIBE_ENDPOINT, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
      },
      body: upstreamBody,
    })
  } catch {
    return jsonError(
      "Failed to reach ElevenLabs speech-to-text endpoint",
      502,
      "upstream_unreachable",
    )
  }

  if (!upstream.ok) {
    const details = await upstream.text().catch(() => "")
    return jsonError(
      `ElevenLabs transcription request failed (${upstream.status})${details ? `: ${details}` : ""}`,
      502,
      "upstream_error",
    )
  }

  const payload = (await upstream.json().catch(() => null)) as
    | UpstreamSingleChannelResponse
    | UpstreamMultichannelResponse
    | null
  const result = extractTranscript(payload)

  if (!result.text) {
    return jsonError(
      "ElevenLabs transcription response did not contain text",
      502,
      "invalid_upstream_payload",
    )
  }

  return NextResponse.json(
    {
      text: result.text,
      languageCode: result.languageCode,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}
