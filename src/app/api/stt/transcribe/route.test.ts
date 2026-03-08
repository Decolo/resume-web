import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const ORIGINAL_ENV = { ...process.env }

function buildRequest(file?: File, languageCode?: string): Request {
  const formData = new FormData()
  if (file) {
    formData.append("file", file)
  }
  if (languageCode) {
    formData.append("languageCode", languageCode)
  }
  return new Request("http://localhost/api/stt/transcribe", {
    method: "POST",
    body: formData,
  })
}

describe("POST /api/stt/transcribe", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...ORIGINAL_ENV }
    delete process.env.ELEVENLABS_API_KEY
    delete process.env.ELEVENLABS_STT_TRANSCRIBE_MODEL
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it("returns 500 when ELEVENLABS_API_KEY is missing", async () => {
    const request = buildRequest(
      new File(["audio"], "sample.webm", { type: "audio/webm" }),
    )
    const response = await POST(request)
    const body = (await response.json()) as { code: string }

    expect(response.status).toBe(500)
    expect(body.code).toBe("missing_server_key")
  })

  it("returns 400 when no audio file is provided", async () => {
    process.env.ELEVENLABS_API_KEY = "secret"

    const response = await POST(buildRequest())
    const body = (await response.json()) as { code: string }

    expect(response.status).toBe(400)
    expect(body.code).toBe("missing_audio_file")
  })

  it("returns 502 when upstream request fails", async () => {
    process.env.ELEVENLABS_API_KEY = "secret"
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("bad request", { status: 400 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const request = buildRequest(
      new File(["audio"], "sample.webm", { type: "audio/webm" }),
    )
    const response = await POST(request)
    const body = (await response.json()) as { code: string; error: string }

    expect(response.status).toBe(502)
    expect(body.code).toBe("upstream_error")
    expect(body.error).toContain("ElevenLabs transcription request failed")
  })

  it("returns transcription text and forwards language code when provided", async () => {
    process.env.ELEVENLABS_API_KEY = "secret"
    process.env.ELEVENLABS_STT_TRANSCRIBE_MODEL = "scribe_v2"

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "hello world",
          language_code: "en",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const request = buildRequest(
      new File(["audio"], "sample.webm", { type: "audio/webm" }),
      "en",
    )
    const response = await POST(request)
    const body = (await response.json()) as { text: string; languageCode?: string }

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/speech-to-text",
      expect.objectContaining({
        method: "POST",
        headers: {
          "xi-api-key": "secret",
        },
      }),
    )

    const call = fetchMock.mock.calls[0]?.[1] as { body: FormData }
    const upstreamBody = call.body

    expect(upstreamBody.get("model_id")).toBe("scribe_v2")
    expect(upstreamBody.get("language_code")).toBe("en")
    expect(response.status).toBe(200)
    expect(body.text).toBe("hello world")
    expect(body.languageCode).toBe("en")
  })
})
