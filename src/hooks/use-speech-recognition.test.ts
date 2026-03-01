import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useSpeechRecognition } from "./use-speech-recognition"
import type {
  SpeechRecognition,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
} from "@/lib/types/speech"

// Mock SpeechRecognition API
class MockSpeechRecognition implements Partial<SpeechRecognition> {
  continuous = false
  interimResults = false
  lang = ""
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null
  onend: (() => void) | null = null
  onstart: (() => void) | null = null

  start = vi.fn(() => {
    if (this.onstart) {
      this.onstart()
    }
  })

  stop = vi.fn(() => {
    if (this.onend) {
      this.onend()
    }
  })

  abort = vi.fn()

  // Helper method to simulate recognition results
  simulateResult(transcript: string, isFinal = true) {
    if (this.onresult) {
      const event = {
        results: {
          length: 1,
          0: {
            isFinal,
            length: 1,
            0: {
              transcript,
              confidence: 0.9,
            },
            item: (index: number) => ({
              transcript,
              confidence: 0.9,
            }),
          },
          item: (index: number) => ({
            isFinal,
            length: 1,
            0: {
              transcript,
              confidence: 0.9,
            },
            item: (index: number) => ({
              transcript,
              confidence: 0.9,
            }),
          }),
        },
        resultIndex: 0,
      } as unknown as SpeechRecognitionEvent
      this.onresult(event)
    }
  }

  // Helper method to simulate errors
  simulateError(error: SpeechRecognitionErrorEvent["error"]) {
    if (this.onerror) {
      const event = {
        error,
        message: `Error: ${error}`,
      } as SpeechRecognitionErrorEvent
      this.onerror(event)
    }
  }
}

describe("useSpeechRecognition", () => {
  let mockRecognition: MockSpeechRecognition

  beforeEach(() => {
    mockRecognition = new MockSpeechRecognition()
    // @ts-expect-error - Mocking global
    window.SpeechRecognition = vi.fn(function MockSpeechRecognitionCtor() {
      return mockRecognition
    })
  })

  afterEach(() => {
    // @ts-expect-error - Cleaning up mock
    delete window.SpeechRecognition
    // @ts-expect-error - Cleaning up mock
    delete window.webkitSpeechRecognition
    vi.clearAllMocks()
  })

  // Test 1: Browser compatibility - not supported
  it("returns isSupported: false when Web Speech API is not available", () => {
    // @ts-expect-error - Removing mock to simulate unsupported browser
    delete window.SpeechRecognition

    const { result } = renderHook(() => useSpeechRecognition())

    expect(result.current.isSupported).toBe(false)
    expect(result.current.isListening).toBe(false)
    expect(result.current.transcript).toBe("")
  })

  // Test 2: Browser compatibility - supported
  it("returns isSupported: true when Web Speech API is available", () => {
    const { result } = renderHook(() => useSpeechRecognition())

    expect(result.current.isSupported).toBe(true)
  })

  // Test 3: Start listening
  it("starts listening when startListening is called", () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.startListening()
    })

    expect(mockRecognition.start).toHaveBeenCalledTimes(1)
    expect(result.current.isListening).toBe(true)
  })

  // Test 4: Accumulate transcript
  it("accumulates transcript from recognition results", () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.startListening()
    })

    act(() => {
      mockRecognition.simulateResult("Hello world", true)
    })

    expect(result.current.transcript).toBe("Hello world")
  })

  // Test 5: Stop listening
  it("stops listening when stopListening is called", () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.startListening()
    })

    act(() => {
      result.current.stopListening()
    })

    expect(mockRecognition.stop).toHaveBeenCalledTimes(1)
    expect(result.current.isListening).toBe(false)
  })

  // Test 6: Handle permission denied error
  it("handles permission denied error", () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.startListening()
    })

    act(() => {
      mockRecognition.simulateError("not-allowed")
    })

    expect(result.current.error).toBe(
      "Microphone access denied. Please enable in browser settings."
    )
    expect(result.current.isListening).toBe(false)
  })

  // Test 7: Cleanup on unmount
  it("cleans up recognition on unmount", () => {
    const { result, unmount } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.startListening()
    })

    unmount()

    expect(mockRecognition.abort).toHaveBeenCalledTimes(1)
  })

  // Test 8: Reset transcript
  it("resets transcript when resetTranscript is called", () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.startListening()
    })

    act(() => {
      mockRecognition.simulateResult("Test transcript", true)
    })

    expect(result.current.transcript).toBe("Test transcript")

    act(() => {
      result.current.resetTranscript()
    })

    expect(result.current.transcript).toBe("")
  })

  // Test 9: Handle interim results
  it("shows interim results separately from final transcript", () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.startListening()
    })

    act(() => {
      mockRecognition.simulateResult("Hello", false) // interim
    })

    expect(result.current.interimTranscript).toBe("Hello")
    expect(result.current.transcript).toBe("")

    act(() => {
      mockRecognition.simulateResult("Hello world", true) // final
    })

    expect(result.current.transcript).toBe("Hello world")
    expect(result.current.interimTranscript).toBe("")
  })

  // Test 10: Handle multiple final results
  it("accumulates multiple final results with spaces", () => {
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.startListening()
    })

    act(() => {
      mockRecognition.simulateResult("Hello", true)
    })

    act(() => {
      mockRecognition.simulateResult("world", true)
    })

    expect(result.current.transcript).toBe("Hello world")
  })
})
