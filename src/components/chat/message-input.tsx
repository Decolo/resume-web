"use client"

import * as React from "react"
import { SendIcon, PaperclipIcon, MicIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useRecordedTranscription } from "@/hooks/use-recorded-transcription"
import { SETTINGS_CHANGED_EVENT, loadActiveSettings } from "@/lib/settings"
import { cn } from "@/lib/utils"

interface MessageInputProps {
  onSend: (message: string, files?: File[]) => void
  disabled?: boolean
  hasResume?: boolean
  isUploadingResume?: boolean
  className?: string
}

function normalizeTranscriptWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function appendWithSpace(base: string, suffix: string): string {
  const left = base.trimEnd()
  const right = normalizeTranscriptWhitespace(suffix)
  if (!right) return left
  if (!left) return right
  return `${left} ${right}`
}

export function MessageInput({
  onSend,
  disabled,
  hasResume,
  isUploadingResume,
  className,
}: MessageInputProps) {
  const [value, setValue] = React.useState("")
  const [sttLanguage, setSttLanguage] = React.useState("")
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [files, setFiles] = React.useState<File[]>([])
  const appliedTranscriptVersionRef = React.useRef(0)

  const {
    isSupported,
    state: voiceState,
    isListening,
    error,
    transcript: latestTranscript,
    transcriptVersion,
    startListening,
    stopListening,
    resetTranscription,
  } = useRecordedTranscription()

  React.useEffect(() => {
    function syncSettings() {
      const settings = loadActiveSettings()
      setSttLanguage(settings.sttLanguage)
    }

    syncSettings()
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncSettings)
    window.addEventListener("focus", syncSettings)

    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, syncSettings)
      window.removeEventListener("focus", syncSettings)
    }
  }, [])

  React.useEffect(() => {
    if (transcriptVersion <= appliedTranscriptVersionRef.current) return
    appliedTranscriptVersionRef.current = transcriptVersion
    setValue((previous) => appendWithSpace(previous, latestTranscript))
  }, [latestTranscript, transcriptVersion])

  React.useEffect(() => {
    if (error) {
      toast.error(error)
    }
  }, [error])

  const canSend = value.trim().length > 0 || files.length > 0

  function clearVoiceSession() {
    resetTranscription()
    appliedTranscriptVersionRef.current = transcriptVersion
  }

  function handleSend() {
    if (!canSend || disabled) return

    if (isListening) {
      stopListening()
    }

    onSend(value.trim(), files.length > 0 ? files : undefined)
    setValue("")
    setFiles([])
    clearVoiceSession()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSend()
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files
    if (selected) {
      setFiles(Array.from(selected))
    }
  }

  async function handleVoiceToggle() {
    if (disabled) return
    if (!isSupported) {
      toast.error(
        "Voice input requires a secure context (https or localhost) and microphone access.",
      )
      return
    }

    if (voiceState === "requesting_permission" || voiceState === "transcribing") {
      return
    }

    if (voiceState === "recording") {
      stopListening()
      return
    }

    await startListening({ languageCode: sttLanguage || undefined })
  }

  const isVoiceBusy =
    voiceState === "requesting_permission" || voiceState === "transcribing"
  const isVoiceRecording = voiceState === "recording"
  const isVoiceTranscribing = voiceState === "transcribing"

  const tooltipText = !isSupported
    ? "Voice input requires https/localhost and browser microphone support"
    : voiceState === "requesting_permission"
      ? "Requesting microphone permission..."
      : voiceState === "transcribing"
        ? "Transcribing..."
        : isListening
          ? "Recording... Click to stop"
          : "Start voice input"

  return (
    <div className={cn("border-t bg-background p-4", className)}>
      {isUploadingResume && (
        <p className="mb-2 text-xs text-muted-foreground">
          Resume is being uploaded and parsed. You can continue after it finishes.
        </p>
      )}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
            >
              {f.name}
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${f.name}`}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
              >
                <PaperclipIcon />
                <span className="sr-only">Attach file</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {hasResume ? "Replace resume file" : "Attach resume file"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => {
                  void handleVoiceToggle()
                }}
                disabled={disabled || isVoiceBusy}
                className={cn(
                  isVoiceRecording &&
                    "bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900 dark:hover:text-red-300",
                )}
              >
                <MicIcon className={cn(isVoiceRecording && "animate-pulse")} />
                <span className="sr-only">
                  {!isSupported
                    ? "Voice input unavailable"
                    : isVoiceRecording
                      ? "Stop recording"
                      : "Start voice input"}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tooltipText}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".json,.md,.txt"
          onChange={handleFileChange}
        />
        <div className="relative flex-1">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your resume... (Cmd+Enter to send)"
            disabled={disabled}
            className={cn(
              "min-h-10 max-h-40 flex-1 resize-none",
              isVoiceTranscribing && "pb-7",
            )}
            rows={1}
          />
          {isVoiceTranscribing && (
            <div
              aria-hidden
              className="pointer-events-none absolute right-3 bottom-2 flex items-center text-muted-foreground"
            >
              <Loader2Icon className="size-3 animate-spin" />
            </div>
          )}
        </div>
        <Button size="icon" onClick={handleSend} disabled={!canSend || disabled}>
          <SendIcon />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </div>
  )
}
