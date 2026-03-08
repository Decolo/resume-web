import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useRecordedTranscription } from "./use-recorded-transcription"

class FakeMediaRecorder {
  static isTypeSupported(type: string): boolean {
    return type.includes("webm")
  }

  public state: RecordingState = "inactive"
  public mimeType: string
  public ondataavailable: ((event: BlobEvent) => void) | null = null
  public onerror: (() => void) | null = null
  public onstop: (() => void) | null = null

  constructor(
    _stream: MediaStream,
    options?: MediaRecorderOptions,
  ) {
    this.mimeType = options?.mimeType || "audio/webm"
  }

  start() {
    this.state = "recording"
  }

  stop() {
    this.state = "inactive"
    this.ondataavailable?.({
      data: new Blob(["audio"], { type: this.mimeType }),
    } as BlobEvent)
    this.onstop?.()
  }
}

function mockSupportedBrowser() {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: true,
  })

  const stopTrack = vi.fn()
  const stream = {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream

  Object.defineProperty(window.navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue(stream),
    },
  })

  vi.stubGlobal("MediaRecorder", FakeMediaRecorder)

  return {
    getUserMediaMock: window.navigator.mediaDevices.getUserMedia as unknown as ReturnType<typeof vi.fn>,
    stopTrack,
  }
}

describe("useRecordedTranscription", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    mockSupportedBrowser()
  })

  it("starts recording and transcribes after stop", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "hello world",
          languageCode: "en",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() => useRecordedTranscription())

    await act(async () => {
      await result.current.startListening({ languageCode: "zh" })
    })
    expect(result.current.state).toBe("recording")

    await act(async () => {
      result.current.stopListening()
      await Promise.resolve()
    })

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = requestInit.body as FormData

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stt/transcribe",
      expect.objectContaining({
        method: "POST",
      }),
    )
    expect(body.get("languageCode")).toBe("zh")
    expect(result.current.state).toBe("idle")
    expect(result.current.transcript).toBe("hello world")
    expect(result.current.transcriptVersion).toBe(1)
    expect(result.current.detectedLanguageCode).toBe("en")
  })

  it("sets unsupported error when browser does not support recording", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: false,
    })

    const { result } = renderHook(() => useRecordedTranscription())

    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.isSupported).toBe(false)
    expect(result.current.error).toBe("Voice input is unavailable in this browser.")
  })

  it("surfaces permission errors from getUserMedia", async () => {
    Object.defineProperty(window.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")),
      },
    })

    const { result } = renderHook(() => useRecordedTranscription())

    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.state).toBe("idle")
    expect(result.current.error).toBe(
      "Microphone access denied. Please enable microphone permission.",
    )
  })

  it("resets transcript and error without changing version", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "hello world",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() => useRecordedTranscription())

    await act(async () => {
      await result.current.startListening()
    })
    await act(async () => {
      result.current.stopListening()
      await Promise.resolve()
    })
    expect(result.current.transcriptVersion).toBe(1)

    act(() => {
      result.current.resetTranscription()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.transcript).toBe("")
    expect(result.current.transcriptVersion).toBe(1)
  })

  it("does not apply late transcription result after reset during transcribing", async () => {
    let resolveFetch: ((value: Response) => void) | null = null
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    const fetchMock = vi.fn().mockReturnValue(fetchPromise)
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() => useRecordedTranscription())

    await act(async () => {
      await result.current.startListening()
    })
    expect(result.current.state).toBe("recording")

    act(() => {
      result.current.stopListening()
    })
    expect(result.current.state).toBe("transcribing")

    act(() => {
      result.current.resetTranscription()
    })

    await act(async () => {
      resolveFetch?.(
        new Response(
          JSON.stringify({
            text: "late transcript",
            languageCode: "en",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      await Promise.resolve()
    })

    expect(result.current.state).toBe("idle")
    expect(result.current.transcript).toBe("")
    expect(result.current.transcriptVersion).toBe(0)
    expect(result.current.detectedLanguageCode).toBeNull()
  })
})
