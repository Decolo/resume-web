"use client"

import * as React from "react"
import { MicIcon, SquareIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useRecordedTranscription } from "@/hooks/use-recorded-transcription"

function appendTranscript(previous: string, next: string): string {
  const left = previous.trim()
  const right = next.trim()
  if (!right) return left
  if (!left) return right
  return `${left}\n${right}`
}

export default function SttDemoPage() {
  const [languageCode, setLanguageCode] = React.useState("")
  const [transcript, setTranscript] = React.useState("")
  const appliedTranscriptVersionRef = React.useRef(0)

  const {
    isSupported,
    state,
    error,
    transcript: latestTranscript,
    transcriptVersion,
    detectedLanguageCode,
    startListening,
    stopListening,
    resetTranscription,
  } = useRecordedTranscription()

  React.useEffect(() => {
    if (transcriptVersion <= appliedTranscriptVersionRef.current) return
    appliedTranscriptVersionRef.current = transcriptVersion
    setTranscript((previous) => appendTranscript(previous, latestTranscript))
  }, [latestTranscript, transcriptVersion])

  const isBusy = state === "requesting_permission" || state === "transcribing"
  const isRecording = state === "recording"

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Speech-to-Text Demo (ElevenLabs)</CardTitle>
          <CardDescription>
            Click once to start recording, click again to stop. After stopping, audio is sent to
            ElevenLabs and transcribed text is rendered below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="stt-language" className="text-sm font-medium">
              Language code (optional)
            </label>
            <Input
              id="stt-language"
              value={languageCode}
              onChange={(event) => setLanguageCode(event.target.value)}
              placeholder="Leave empty for auto-detection, e.g. en / zh / ja"
              disabled={isBusy || isRecording}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => {
                void (isRecording
                  ? stopListening()
                  : startListening({ languageCode: languageCode || undefined }))
              }}
              disabled={isBusy}
              variant={isRecording ? "destructive" : "default"}
            >
              {isRecording ? (
                <>
                  <SquareIcon className="size-4" />
                  Stop Recording
                </>
              ) : (
                <>
                  <MicIcon className="size-4" />
                  Start Recording
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTranscript("")
                appliedTranscriptVersionRef.current = transcriptVersion
                resetTranscription()
              }}
              disabled={isRecording || state === "requesting_permission"}
            >
              Clear Result
            </Button>

            <span className="text-sm text-muted-foreground">
              Status:{" "}
              {state === "requesting_permission"
                ? "requesting microphone permission"
                : state === "recording"
                  ? "recording"
                  : state === "transcribing"
                    ? "transcribing"
                    : "idle"}
            </span>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="space-y-2">
            <label htmlFor="stt-output" className="text-sm font-medium">
              Transcribed text
            </label>
            <Textarea
              id="stt-output"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="Transcription result will appear here..."
              className="min-h-36"
            />
            <p className="text-xs text-muted-foreground">
              {!isSupported
                ? "Voice input unavailable: requires localhost/https + microphone support."
                : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {detectedLanguageCode
                ? `Detected language: ${detectedLanguageCode}`
                : "Detected language: n/a"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
