"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type {
  SpeechRecognition,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
} from "@/lib/types/speech"

export interface UseSpeechRecognitionReturn {
  isSupported: boolean
  isListening: boolean
  transcript: string
  interimTranscript: string
  error: string | null
  startListening: () => void
  stopListening: () => void
  resetTranscript: () => void
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  // Check browser support
  const [isSupported] = useState(() => {
    if (typeof window === "undefined") return false
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  })

  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [interimTranscript, setInterimTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const shouldContinueListeningRef = useRef(false)

  // Initialize recognition instance
  useEffect(() => {
    if (!isSupported) return

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = navigator.language || "en-US"

      recognition.onstart = () => {
        setIsListening(true)
        setError(null)
      }

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ""
        let final = ""

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const transcriptText = result[0].transcript

          if (result.isFinal) {
            final += transcriptText + " "
          } else {
            interim += transcriptText
          }
        }

        if (final) {
          setTranscript((prev) => {
            const next = [prev, final.trim()]
              .filter((text) => text.length > 0)
              .join(" ")
            return next.replace(/\s+/g, " ").trim()
          })
          setInterimTranscript("")
        }

        if (interim) {
          setInterimTranscript(interim)
        }
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        const errorMessages: Record<string, string> = {
          "not-allowed":
            "Microphone access denied. Please enable in browser settings.",
          "no-speech": "No speech detected. Please try again.",
          "audio-capture": "Microphone not found. Please check your device.",
          network: "Network error. Please check your connection.",
        }

        if (event.error === "aborted") {
          // Expected when user stops recording.
          return
        }

        // Do not auto-restart after a hard error.
        shouldContinueListeningRef.current = false
        setError(errorMessages[event.error] || "Speech recognition error. Please try again.")
        setIsListening(false)
      }

      recognition.onend = () => {
        // Auto-restart only when caller still wants continuous listening.
        if (shouldContinueListeningRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.start()
            return
          } catch {
            shouldContinueListeningRef.current = false
          }
        }
        setIsListening(false)
      }

      recognitionRef.current = recognition
    }

    // Cleanup on unmount
    return () => {
      shouldContinueListeningRef.current = false
      if (recognitionRef.current) {
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
    }
  }, [isSupported])

  const startListening = useCallback(() => {
    if (!isSupported || !recognitionRef.current) return

    shouldContinueListeningRef.current = true

    try {
      recognitionRef.current.start()
      setIsListening(true)
      setError(null)
    } catch (err) {
      // Ignore transient browser start race (e.g. already started).
      const message = err instanceof Error ? err.message : ""
      const shouldIgnore = message.toLowerCase().includes("already")
      if (!shouldIgnore) {
        setIsListening(false)
        shouldContinueListeningRef.current = false
      }
    }
  }, [isSupported])

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return

    shouldContinueListeningRef.current = false

    try {
      recognitionRef.current.stop()
      setIsListening(false)
    } catch (err) {
      console.warn("Error stopping recognition", err)
    }
  }, [])

  const resetTranscript = useCallback(() => {
    setTranscript("")
    setInterimTranscript("")
  }, [])

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  }
}
