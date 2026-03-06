"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai"
import { FileTextIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { ChatPanel } from "@/components/chat/chat-panel"
import { EmptyState } from "@/components/chat/empty-state"
import { ResumePreview, type JsonResume } from "@/components/editor/resume-preview"
import { DiffView } from "@/components/editor/diff-view"
import { EditorToolbar } from "@/components/editor/editor-toolbar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { loadActiveSettings, SETTINGS_CHANGED_EVENT } from "@/lib/settings"
import { cn } from "@/lib/utils"
import { useResume } from "@/hooks/use-resume"
import { useChangeHistory } from "@/hooks/use-change-history"
import {
  useSessionResumes,
  useCreateResume,
  useUpdateResume,
  useSessionMessages,
  type ResumeRecord,
} from "@/hooks/use-sessions"

function parseResumeJson(content: string): JsonResume {
  try {
    return JSON.parse(content) as JsonResume
  } catch {
    return {}
  }
}

function formatResumeTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function makeAssistantNotice(text: string): UIMessage {
  return {
    id: `local-${crypto.randomUUID()}`,
    role: "assistant",
    parts: [{ type: "text", text }] as UIMessage["parts"],
  }
}

function nextResumeTitle(existingCount: number): string {
  return `Resume ${existingCount + 1}`
}

export default function SessionClient() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data: resumeRecords = [] } = useSessionResumes(id)
  const createResumeMut = useCreateResume()
  const updateResumeMut = useUpdateResume()

  const {
    data: savedMessages,
    isLoading: isMessagesLoading,
    isFetching: isMessagesFetching,
  } = useSessionMessages(id)

  const { resume, setResume, updateSection } = useResume()
  const [apiKey, setApiKey] = React.useState("")
  const [provider, setProvider] = React.useState<"openai" | "gemini">("gemini")
  const [baseURL, setBaseURL] = React.useState("")
  const [modelId, setModelId] = React.useState("")

  const [selectedResumeId, setSelectedResumeId] = React.useState<string | null>(null)
  const [diffBaseSnapshot, setDiffBaseSnapshot] = React.useState("{}")
  const pendingDiffBaseRef = React.useRef<string | null>(null)
  const loadedResumeIdRef = React.useRef<string | null>(null)
  const prevResumeRef = React.useRef<string>("")

  const [isUploadingResume, setIsUploadingResume] = React.useState(false)
  const [autoApprove, setAutoApprove] = React.useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("resume-agent-auto-approve") === "true"
    }
    return false
  })

  const selectedResume = React.useMemo<ResumeRecord | null>(() => {
    if (resumeRecords.length === 0) return null
    if (!selectedResumeId) return resumeRecords[0]
    return resumeRecords.find((r) => r.id === selectedResumeId) ?? resumeRecords[0]
  }, [resumeRecords, selectedResumeId])

  // Persist auto-approve preference
  React.useEffect(() => {
    localStorage.setItem("resume-agent-auto-approve", String(autoApprove))
  }, [autoApprove])

  // Keep a valid selected resume id when resume list changes.
  React.useEffect(() => {
    if (resumeRecords.length === 0) {
      setSelectedResumeId(null)
      loadedResumeIdRef.current = null
      return
    }

    setSelectedResumeId((current) => {
      if (current && resumeRecords.some((r) => r.id === current)) return current
      return resumeRecords[0].id
    })
  }, [resumeRecords])

  // Apply selected resume content to editor state.
  React.useEffect(() => {
    if (!selectedResume) {
      setResume({})
      prevResumeRef.current = ""
      setDiffBaseSnapshot("{}")
      useChangeHistory.getState().clearChanges()
      return
    }

    const parsed = parseResumeJson(selectedResume.content)
    const normalized = JSON.stringify(parsed)

    if (loadedResumeIdRef.current !== selectedResume.id) {
      const base = pendingDiffBaseRef.current ?? selectedResume.content
      setDiffBaseSnapshot(base)
      pendingDiffBaseRef.current = null
      useChangeHistory.getState().clearChanges()
      loadedResumeIdRef.current = selectedResume.id
    }

    // Avoid resetting editor/history if the content is already current in local state.
    if (normalized !== prevResumeRef.current) {
      setResume(parsed)
      prevResumeRef.current = normalized
    }
  }, [selectedResume, setResume])

  // Read settings from localStorage on mount + react to settings changes
  React.useEffect(() => {
    function syncSettings() {
      const s = loadActiveSettings()
      setApiKey(s.apiKey)
      setProvider(s.provider)
      setBaseURL(s.baseURL)
      setModelId(s.modelId)
    }

    syncSettings()
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncSettings)
    window.addEventListener("focus", syncSettings)
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, syncSettings)
      window.removeEventListener("focus", syncSettings)
    }
  }, [])

  // Use a ref so the transport body always reads the latest values.
  const settingsRef = React.useRef({ provider, apiKey, baseURL, modelId, resume })
  settingsRef.current = { provider, apiKey, baseURL, modelId, resume }

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => {
          const { provider: p, apiKey: k, baseURL: b, modelId: m, resume: r } = settingsRef.current
          return {
            provider: p,
            apiKey: k,
            baseURL: b || undefined,
            modelId: m || undefined,
            resume: r,
          }
        },
      }),
    []
  )

  const { messages, sendMessage, addToolApprovalResponse, status, setMessages } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (err) => {
      toast.error(err.message || "Something went wrong")
    },
  })

  const appendResumeSwitchNotice = React.useCallback(
    (targetTitle: string) => {
      setMessages((current) => [
        ...current,
        makeAssistantNotice(`Switched active resume to **${targetTitle}**.`),
      ])
    },
    [setMessages]
  )

  const processedToolCalls = React.useRef(new Set<string>())
  const currentMessagesRef = React.useRef<UIMessage[]>([])
  const hasHydratedMessagesRef = React.useRef(false)
  const isRestoringMessagesRef = React.useRef(false)
  const hasLocalMessagesBeforeHydrationRef = React.useRef(false)
  const lastPersistedPayloadRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    currentMessagesRef.current = messages
    if (!hasHydratedMessagesRef.current && messages.length > 0) {
      hasLocalMessagesBeforeHydrationRef.current = true
    }
  }, [messages])

  const persistMessages = React.useCallback(
    (nextMessages: UIMessage[]) => {
      if (!id) return
      if (nextMessages.length === 0) return
      const payload = JSON.stringify(nextMessages)
      if (payload === lastPersistedPayloadRef.current) return

      lastPersistedPayloadRef.current = payload
      void fetch(`/api/sessions/${id}/messages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
      })
        .then((res) => {
          if (!res.ok) {
            lastPersistedPayloadRef.current = null
          }
        })
        .catch(() => {
          lastPersistedPayloadRef.current = null
        })
    },
    [id]
  )

  // Reset session-scoped UI state immediately on route change to avoid cross-session bleed.
  React.useEffect(() => {
    hasHydratedMessagesRef.current = false
    isRestoringMessagesRef.current = false
    hasLocalMessagesBeforeHydrationRef.current = false
    lastPersistedPayloadRef.current = null
    setResume({})
    setMessages([])
    prevResumeRef.current = ""
    setDiffBaseSnapshot("{}")
    pendingDiffBaseRef.current = null
    loadedResumeIdRef.current = null
    processedToolCalls.current.clear()
  }, [id, setResume, setMessages])

  // Flush latest chat snapshot before leaving current session route.
  React.useEffect(() => {
    return () => {
      persistMessages(currentMessagesRef.current)
    }
  }, [persistMessages])

  // Restore messages from DB once loaded (including empty arrays).
  React.useEffect(() => {
    if (!id || isMessagesLoading || isMessagesFetching || hasHydratedMessagesRef.current) return

    if (hasLocalMessagesBeforeHydrationRef.current) {
      hasHydratedMessagesRef.current = true
      isRestoringMessagesRef.current = false
      persistMessages(currentMessagesRef.current)
      return
    }

    hasHydratedMessagesRef.current = true
    isRestoringMessagesRef.current = true
    const initialMessages = savedMessages ?? []
    lastPersistedPayloadRef.current = JSON.stringify(initialMessages)
    setMessages(initialMessages)
  }, [id, savedMessages, isMessagesLoading, isMessagesFetching, setMessages, persistMessages])

  const isLoading = status === "submitted" || status === "streaming"

  React.useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue
      for (const part of msg.parts ?? []) {
        if (!part.type.startsWith("tool-")) continue
        const toolPart = part as unknown as {
          type: string
          toolCallId: string
          toolName: string
          state: string
          input: { path: string; value: unknown }
          approval?: { id: string }
        }

        if (
          toolPart.state === "approval-requested" &&
          toolPart.approval &&
          autoApprove &&
          (toolPart.toolName === "updateSection" || toolPart.type === "tool-updateSection")
        ) {
          addToolApprovalResponse({ id: toolPart.approval.id, approved: true })
        }

        if (
          toolPart.state === "output-available" &&
          (toolPart.toolName === "updateSection" || toolPart.type === "tool-updateSection") &&
          !processedToolCalls.current.has(toolPart.toolCallId)
        ) {
          processedToolCalls.current.add(toolPart.toolCallId)
          updateSection(toolPart.input.path, toolPart.input.value, {
            toolCallId: toolPart.toolCallId,
            source: "ai",
          })
          toast.success(`Updated ${toolPart.input.path}`)
        }

        if (
          toolPart.state === "output-denied" &&
          (toolPart.toolName === "updateSection" || toolPart.type === "tool-updateSection") &&
          !processedToolCalls.current.has(toolPart.toolCallId)
        ) {
          processedToolCalls.current.add(toolPart.toolCallId)
          toast("Rejected update to " + toolPart.input.path)
        }
      }
    }
  }, [messages, autoApprove, addToolApprovalResponse, updateSection])

  // Persist messages to DB (debounced — only when not streaming).
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    if (!id || isLoading || isMessagesLoading || isMessagesFetching || !hasHydratedMessagesRef.current) return
    if (isRestoringMessagesRef.current) {
      isRestoringMessagesRef.current = false
      return
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      persistMessages(messages)
    }, 600)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [id, messages, isLoading, isMessagesLoading, isMessagesFetching, persistMessages])

  // Persist selected resume changes back to DB.
  React.useEffect(() => {
    if (!id || !selectedResume) return

    const json = JSON.stringify(resume)
    if (json === prevResumeRef.current) return

    prevResumeRef.current = json
    updateResumeMut.mutate(
      {
        id: selectedResume.id,
        sessionId: id,
        title: selectedResume.title,
        content: json,
      },
      {
        onError: (error) => {
          const err = error as Error
          toast.error(err.message || "Failed to save resume")
        },
      }
    )
  }, [resume, id, selectedResume, updateResumeMut])

  // If the user starts from scratch and no resume row exists yet, create one automatically.
  const autoCreateLockRef = React.useRef(false)
  React.useEffect(() => {
    if (!id || selectedResume || autoCreateLockRef.current) return

    const json = JSON.stringify(resume)
    if (json === "{}") return

    autoCreateLockRef.current = true
    createResumeMut.mutate(
      {
        sessionId: id,
        title: nextResumeTitle(resumeRecords.length),
        content: json,
      },
      {
        onSuccess: (created) => {
          pendingDiffBaseRef.current = "{}"
          setSelectedResumeId(created.id)
          appendResumeSwitchNotice(created.title)
        },
        onError: (error) => {
          const err = error as Error
          toast.error(err.message || "Failed to create resume")
        },
        onSettled: () => {
          autoCreateLockRef.current = false
        },
      }
    )
  }, [id, selectedResume, resume, createResumeMut, resumeRecords.length, appendResumeSwitchNotice])

  function handleToolApprove(approvalId: string) {
    addToolApprovalResponse({ id: approvalId, approved: true })
  }

  function handleToolReject(approvalId: string) {
    addToolApprovalResponse({ id: approvalId, approved: false })
  }

  async function handleCreateResume() {
    if (!id || createResumeMut.isPending) return

    const sourceSnapshot = JSON.stringify(resume)
    const content = selectedResume ? sourceSnapshot : "{}"

    try {
      const created = await createResumeMut.mutateAsync({
        sessionId: id,
        title: nextResumeTitle(resumeRecords.length),
        content,
      })

      pendingDiffBaseRef.current = selectedResume ? sourceSnapshot : "{}"
      setSelectedResumeId(created.id)
      appendResumeSwitchNotice(created.title)
      toast.success("Created and selected a new resume")
    } catch (error) {
      const err = error as Error
      toast.error(err.message || "Failed to create resume")
    }
  }

  function handleSelectResume(nextResume: ResumeRecord) {
    if (nextResume.id === selectedResume?.id) return

    pendingDiffBaseRef.current = JSON.stringify(resume)
    setSelectedResumeId(nextResume.id)
    appendResumeSwitchNotice(nextResume.title)
  }

  async function doUpload(file: File, message?: string) {
    if (isUploadingResume) return

    setIsUploadingResume(true)
    const formData = new FormData()
    formData.append("sessionId", id)
    formData.append("file", file)

    const { provider: p, apiKey: k, baseURL: b, modelId: m } = settingsRef.current
    formData.append("provider", p)
    if (k) formData.append("apiKey", k)
    if (b) formData.append("baseURL", b)
    if (m) formData.append("modelId", m)

    try {
      const res = await fetch("/api/files", { method: "POST", body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const error = err as { error?: string }
        throw new Error(error.error || "Upload failed")
      }

      const data = (await res.json()) as {
        resume?: ResumeRecord
      }

      if (data.resume) {
        const uploadedResume = data.resume
        queryClient.setQueryData<ResumeRecord[]>(["resumes", id], (current = []) => {
          const withoutCurrent = current.filter((record) => record.id !== uploadedResume.id)
          return [uploadedResume, ...withoutCurrent]
        })

        pendingDiffBaseRef.current = JSON.stringify(resume)
        setSelectedResumeId(uploadedResume.id)
        appendResumeSwitchNotice(uploadedResume.title)
      }

      sendMessage({ text: message || `Uploaded ${file.name}` })
    } catch (err) {
      const error = err as Error
      toast.error(`Upload failed: ${error.message}`)
    } finally {
      setIsUploadingResume(false)
    }
  }

  function handleSend(message: string, files?: File[]) {
    if (isUploadingResume) return

    if (files && files.length > 0) {
      void doUpload(files[0], message)
      return
    }

    sendMessage({ text: message })
  }

  function handleUpload(file: File) {
    if (isUploadingResume) return
    void doUpload(file)
  }

  function handleCreateNew() {
    sendMessage({ text: "I want to create a new resume from scratch" })
  }

  const hasResume = selectedResume !== null
  const showEmptyState = resumeRecords.length === 0 && messages.length === 0

  return (
    <div className="flex h-full min-h-0">
      {/* Chat panel - left side */}
      <div className="flex min-h-0 w-full flex-col border-r md:w-1/2">
        {!apiKey && (
          <div className="border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
            Set your API key in Settings to start chatting.
          </div>
        )}

        {showEmptyState ? (
          <EmptyState
            onUpload={handleUpload}
            onCreateNew={handleCreateNew}
            isUploadingResume={isUploadingResume}
            className="flex-1"
          />
        ) : (
          <ChatPanel
            messages={messages}
            onSend={handleSend}
            onToolApprove={handleToolApprove}
            onToolReject={handleToolReject}
            isLoading={isLoading}
            isUploadingResume={isUploadingResume}
            hasResume={hasResume}
            className="flex-1"
          />
        )}
      </div>

      {/* Resume side panel - right side */}
      <div className="hidden min-h-0 flex-1 md:flex md:flex-col">
        <EditorToolbar autoApprove={autoApprove} onAutoApproveChange={setAutoApprove} />

        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Resumes</h2>
              <p className="text-xs text-muted-foreground">
                Select which resume is active for preview, diff, and AI edits.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCreateResume}
              disabled={createResumeMut.isPending || isUploadingResume}
            >
              <PlusIcon className="mr-1 size-4" />
              New resume
            </Button>
          </div>

          <ScrollArea className="mt-3 h-36 rounded-md border">
            {resumeRecords.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                No resumes yet. Upload one from chat or create a new resume.
              </div>
            ) : (
              <div className="p-2">
                {resumeRecords.map((record) => {
                  const isActive = record.id === selectedResume?.id
                  return (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => handleSelectResume(record)}
                      className={cn(
                        "mb-1 w-full rounded-md border px-3 py-2 text-left transition-colors",
                        isActive
                          ? "border-primary bg-primary/5"
                          : "border-transparent hover:border-border hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <FileTextIcon className="size-4 text-muted-foreground" />
                        <p className="truncate text-sm font-medium">{record.title}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Updated {formatResumeTimestamp(record.updatedAt)}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-2">
          <section className="flex min-h-0 flex-col border-b">
            <div className="border-b px-4 py-2">
              <h3 className="text-sm font-semibold">Preview</h3>
              <p className="text-xs text-muted-foreground">
                {selectedResume ? selectedResume.title : "No active resume selected"}
              </p>
            </div>
            <ResumePreview resume={resume as JsonResume} className="flex-1" />
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="border-b px-4 py-2">
              <h3 className="text-sm font-semibold">Field diff</h3>
              <p className="text-xs text-muted-foreground">
                Comparing active resume against the previous selection baseline.
              </p>
            </div>
            <div className="min-h-0 flex-1 p-4">
              <DiffView
                before={diffBaseSnapshot || "{}"}
                after={JSON.stringify(resume, null, 2)}
                className="h-full"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
