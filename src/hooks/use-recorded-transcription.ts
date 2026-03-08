"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export type VoiceInputState = "idle" | "requesting_permission" | "recording" | "transcribing"

export interface StartListeningOptions {
  languageCode?: string
}

interface TranscribeResponse {
  text?: string
  languageCode?: string
  error?: string
}

interface TranscribeResult {
  transcript: string
  languageCode: string | null
}

export interface UseRecordedTranscriptionReturn {
  isSupported: boolean
  state: VoiceInputState
  isListening: boolean
  error: string | null
  transcript: string
  transcriptVersion: number
  detectedLanguageCode: string | null
  startListening: (options?: StartListeningOptions) => Promise<void>
  stopListening: () => void
  resetTranscription: () => void
}

const MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return undefined
  }
  return MIME_TYPE_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}

function toFileExtension(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm"
  if (mimeType.includes("mp4")) return "m4a"
  return "wav"
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error.length > 0) return error
  return "Voice transcription failed. Please try again."
}

function formatUserFacingError(error: unknown): string {
  const message = getErrorMessage(error)
  if (message.toLowerCase().includes("permission")) {
    return "Microphone access denied. Please enable microphone permission."
  }
  return message
}

export function useRecordedTranscription(): UseRecordedTranscriptionReturn {
  const [state, setState] = useState<VoiceInputState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState("")
  const [transcriptVersion, setTranscriptVersion] = useState(0)
  const [detectedLanguageCode, setDetectedLanguageCode] = useState<string | null>(null)
  const languageCodeRef = useRef<string | undefined>(undefined)
  const sessionCounterRef = useRef(0)
  const activeSessionIdRef = useRef<number | null>(null)
  const discardThroughSessionIdRef = useRef(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>("audio/webm")

  const isSupported =
    typeof window !== "undefined" &&
    !!window.isSecureContext &&
    !!window.navigator?.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"

  const stopTracks = useCallback(() => {
    const stream = mediaStreamRef.current
    if (!stream) return
    for (const track of stream.getTracks()) {
      track.stop()
    }
    mediaStreamRef.current = null
  }, [])

  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<TranscribeResult> => {
    if (audioBlob.size === 0) {
      throw new Error("Recorded audio is empty.")
    }

    const mimeType = mimeTypeRef.current || "audio/webm"
    const extension = toFileExtension(mimeType)
    const audioFile = new File([audioBlob], `voice-input.${extension}`, { type: mimeType })

    const formData = new FormData()
    formData.append("file", audioFile)
    const languageCode = languageCodeRef.current?.trim()
    if (languageCode && languageCode.length > 0) {
      formData.append("languageCode", languageCode)
    }

    const response = await fetch("/api/stt/transcribe", {
      method: "POST",
      body: formData,
    })
    const data = (await response.json().catch(() => ({}))) as TranscribeResponse

    if (!response.ok) {
      throw new Error(data.error || "Failed to transcribe audio.")
    }

    return {
      transcript: data.text?.trim() || "",
      languageCode: data.languageCode || null,
    }
  }, [])

  const shouldDiscardSession = useCallback((sessionId: number) => {
    return sessionId <= discardThroughSessionIdRef.current
  }, [])

  const startListening = useCallback(
    async (options?: StartListeningOptions) => {
      if (!isSupported) {
        setError("Voice input is unavailable in this browser.")
        return
      }
      if (state !== "idle") return

      setError(null)
      setDetectedLanguageCode(null)
      setState("requesting_permission")
      chunksRef.current = []
      languageCodeRef.current = options?.languageCode?.trim() || undefined

      try {
        const sessionId = sessionCounterRef.current + 1
        sessionCounterRef.current = sessionId

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        mediaStreamRef.current = stream

        const selectedMimeType = pickRecorderMimeType()
        const recorder = new MediaRecorder(
          stream,
          selectedMimeType ? { mimeType: selectedMimeType } : undefined,
        )
        mimeTypeRef.current = recorder.mimeType || selectedMimeType || "audio/webm"

        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data)
          }
        }

        recorder.onerror = () => {
          setError("Recording failed. Please try again.")
          setState("idle")
          if (activeSessionIdRef.current === sessionId) {
            activeSessionIdRef.current = null
          }
          stopTracks()
        }

        recorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, {
            type: mimeTypeRef.current || "audio/webm",
          })
          chunksRef.current = []
          stopTracks()

          try {
            const result = await transcribeAudio(blob)
            if (shouldDiscardSession(sessionId)) {
              return
            }
            if (result.transcript.length > 0) {
              setTranscript(result.transcript)
              setTranscriptVersion((version) => version + 1)
            }
            setDetectedLanguageCode(result.languageCode)
          } catch (recordingError) {
            if (shouldDiscardSession(sessionId)) {
              return
            }
            setError(formatUserFacingError(recordingError))
          } finally {
            if (activeSessionIdRef.current === sessionId) {
              activeSessionIdRef.current = null
            }
            setState("idle")
          }
        }

        mediaRecorderRef.current = recorder
        activeSessionIdRef.current = sessionId
        recorder.start(250)
        setState("recording")
      } catch (permissionError) {
        setError(formatUserFacingError(permissionError))
        setState("idle")
        stopTracks()
      }
    },
    [isSupported, shouldDiscardSession, state, stopTracks, transcribeAudio],
  )

  const stopListening = useCallback(() => {
    if (state !== "recording") return

    const recorder = mediaRecorderRef.current
    if (!recorder) {
      setState("idle")
      activeSessionIdRef.current = null
      stopTracks()
      return
    }

    setState("transcribing")
    recorder.stop()
    mediaRecorderRef.current = null
  }, [state, stopTracks])

  const resetTranscription = useCallback(() => {
    if (activeSessionIdRef.current !== null) {
      discardThroughSessionIdRef.current = Math.max(
        discardThroughSessionIdRef.current,
        activeSessionIdRef.current,
      )
    }
    setError(null)
    setTranscript("")
    setDetectedLanguageCode(null)
    chunksRef.current = []
  }, [])

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== "inactive") {
        recorder.stop()
      }
      mediaRecorderRef.current = null
      stopTracks()
    }
  }, [stopTracks])

  const isListening = useMemo(
    () => state === "requesting_permission" || state === "recording" || state === "transcribing",
    [state],
  )

  return {
    isSupported,
    state,
    isListening,
    error,
    transcript,
    transcriptVersion,
    detectedLanguageCode,
    startListening,
    stopListening,
    resetTranscription,
  }
}
