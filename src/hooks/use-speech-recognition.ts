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

        setError(errorMessages[event.error] || "Speech recognition error. Please try again.")
        setIsListening(false)
      }

      recognition.onend = () => {
        // Auto-restart if still supposed to be listening
        if (isListening && recognitionRef.current) {
          try {
            recognitionRef.current.start()
          } catch {
            setIsListening(false)
          }
        } else {
          setIsListening(false)
        }
      }

      recognitionRef.current = recognition
    }

    // Cleanup on unmount
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
    }
  }, [isSupported, isListening])

  const startListening = useCallback(() => {
    if (!isSupported || !recognitionRef.current) return

    try {
      recognitionRef.current.start()
      setIsListening(true)
      setError(null)
    } catch (err) {
      // Already started, ignore
      console.warn("Recognition already started", err)
    }
  }, [isSupported])

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return

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
