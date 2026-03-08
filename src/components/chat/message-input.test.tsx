import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { MessageInput } from "./message-input"

const startListeningMock = vi.fn().mockResolvedValue(undefined)
const stopListeningMock = vi.fn()
const resetTranscriptionMock = vi.fn()

type HookState = {
  isSupported: boolean
  state: "idle" | "requesting_permission" | "recording" | "transcribing"
  isListening: boolean
  transcript: string
  transcriptVersion: number
  error: string | null
}

const hookState: HookState = {
  isSupported: true,
  state: "idle",
  isListening: false,
  transcript: "",
  transcriptVersion: 0,
  error: null,
}

vi.mock("@/hooks/use-recorded-transcription", () => ({
  useRecordedTranscription: () => ({
    ...hookState,
    startListening: startListeningMock,
    stopListening: stopListeningMock,
    resetTranscription: resetTranscriptionMock,
  }),
}))

vi.mock("@/lib/settings", () => ({
  SETTINGS_CHANGED_EVENT: "resume-agent-settings-changed",
  loadActiveSettings: () => ({
    provider: "gemini",
    apiKey: "",
    baseURL: "",
    modelId: "",
    sttLanguage: "zh",
  }),
}))

describe("MessageInput realtime voice input", () => {
  beforeEach(() => {
    startListeningMock.mockClear()
    stopListeningMock.mockClear()
    resetTranscriptionMock.mockClear()

    hookState.isSupported = true
    hookState.state = "idle"
    hookState.isListening = false
    hookState.transcript = ""
    hookState.transcriptVersion = 0
    hookState.error = null
  })

  it("starts voice recording with configured language", async () => {
    render(<MessageInput onSend={vi.fn()} />)

    const textarea = screen.getByPlaceholderText("Ask about your resume... (Cmd+Enter to send)")
    fireEvent.change(textarea, { target: { value: "draft" } })

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }))

    expect(startListeningMock).toHaveBeenCalledTimes(1)
    expect(startListeningMock).toHaveBeenCalledWith({ languageCode: "zh" })
  })

  it("stops realtime transcription before sending", () => {
    hookState.state = "recording"
    hookState.isListening = true

    const onSend = vi.fn()
    render(<MessageInput onSend={onSend} />)

    const textarea = screen.getByPlaceholderText("Ask about your resume... (Cmd+Enter to send)")
    fireEvent.change(textarea, { target: { value: "hello" } })

    fireEvent.click(screen.getByRole("button", { name: "Send message" }))

    expect(stopListeningMock).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith("hello", undefined)
    expect(resetTranscriptionMock).toHaveBeenCalledTimes(1)
  })

  it("appends finalized transcript to existing typed text", () => {
    const { rerender } = render(<MessageInput onSend={vi.fn()} />)

    const textarea = screen.getByPlaceholderText("Ask about your resume... (Cmd+Enter to send)")
    fireEvent.change(textarea, { target: { value: "existing text" } })

    hookState.transcript = "voice input"
    hookState.transcriptVersion = 1

    rerender(<MessageInput onSend={vi.fn()} />)

    expect(
      (screen.getByPlaceholderText("Ask about your resume... (Cmd+Enter to send)") as HTMLTextAreaElement)
        .value,
    ).toBe("existing text voice input")
  })

  it("appends each transcription result incrementally", () => {
    const { rerender } = render(<MessageInput onSend={vi.fn()} />)

    const textarea = screen.getByPlaceholderText("Ask about your resume... (Cmd+Enter to send)")
    fireEvent.change(textarea, { target: { value: "existing text" } })

    hookState.transcript = "hello"
    hookState.transcriptVersion = 1
    rerender(<MessageInput onSend={vi.fn()} />)

    hookState.transcript = "world"
    hookState.transcriptVersion = 2
    rerender(<MessageInput onSend={vi.fn()} />)

    hookState.transcript = "world"
    hookState.transcriptVersion = 2
    rerender(<MessageInput onSend={vi.fn()} />)

    expect(
      (screen.getByPlaceholderText("Ask about your resume... (Cmd+Enter to send)") as HTMLTextAreaElement)
        .value,
    ).toBe("existing text hello world")
  })

  it("preserves existing multiline formatting when appending transcript", () => {
    const { rerender } = render(<MessageInput onSend={vi.fn()} />)

    const textarea = screen.getByPlaceholderText("Ask about your resume... (Cmd+Enter to send)")
    fireEvent.change(textarea, { target: { value: "line 1\nline 2" } })

    hookState.transcript = "hello"
    hookState.transcriptVersion = 1
    rerender(<MessageInput onSend={vi.fn()} />)

    expect(
      (screen.getByPlaceholderText("Ask about your resume... (Cmd+Enter to send)") as HTMLTextAreaElement)
        .value,
    ).toBe("line 1\nline 2 hello")
  })

  it("shows explicit error when browser voice input is unsupported", () => {
    const toastErrorSpy = vi.spyOn(toast, "error").mockImplementation(() => "")
    hookState.isSupported = false
    render(<MessageInput onSend={vi.fn()} />)

    const micButton = screen.getByRole("button", { name: "Voice input unavailable" })
    expect(micButton).toBeEnabled()
    fireEvent.click(micButton)

    expect(startListeningMock).not.toHaveBeenCalled()
    expect(toastErrorSpy).toHaveBeenCalledWith(
      "Voice input requires a secure context (https or localhost) and microphone access.",
    )
  })

  it("stops recording when voice button is clicked during active recording", () => {
    hookState.state = "recording"
    hookState.isListening = true

    render(<MessageInput onSend={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }))

    expect(stopListeningMock).toHaveBeenCalledTimes(1)
  })

  it("disables voice button while transcribing after stop", () => {
    hookState.state = "transcribing"
    hookState.isListening = true

    render(<MessageInput onSend={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Start voice input" })).toBeDisabled()
  })
})
