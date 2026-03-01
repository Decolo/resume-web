"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai"
import { toast } from "sonner"
import { ChatPanel } from "@/components/chat/chat-panel"
import { EmptyState } from "@/components/chat/empty-state"
import { ResumePreview, type JsonResume } from "@/components/editor/resume-preview"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DiffView } from "@/components/editor/diff-view"
import { ChangeHistory } from "@/components/editor/change-history"
import { EditorToolbar } from "@/components/editor/editor-toolbar"
import { loadActiveSettings, SETTINGS_CHANGED_EVENT } from "@/lib/settings"
import { useResume } from "@/hooks/use-resume"
import {
  useSessionResume,
  useCreateResume,
  useUpdateResume,
  useSessionMessages,
} from "@/hooks/use-sessions"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export default function SessionClient() {
  const { id } = useParams<{ id: string }>()
  const { data: resumeRecord } = useSessionResume(id)
  const createResumeMut = useCreateResume()
  const updateResumeMut = useUpdateResume()
  const { data: savedMessages, isLoading: isMessagesLoading } = useSessionMessages(id)
  const { resume, setResume, updateSection } = useResume()
  const [apiKey, setApiKey] = React.useState("")
  const [provider, setProvider] = React.useState<"openai" | "gemini">("gemini")
  const [baseURL, setBaseURL] = React.useState("")
  const [modelId, setModelId] = React.useState("")
  const prevResumeRef = React.useRef<string>("")
  const [prevResumeSnapshot, setPrevResumeSnapshot] = React.useState<string>("")
  const [showOverwriteDialog, setShowOverwriteDialog] = React.useState(false)
  const pendingFileRef = React.useRef<{ file: File; message?: string } | null>(null)
  const [autoApprove, setAutoApprove] = React.useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("resume-agent-auto-approve") === "true"
    }
    return false
  })

  // Persist auto-approve preference
  React.useEffect(() => {
    localStorage.setItem("resume-agent-auto-approve", String(autoApprove))
  }, [autoApprove])

  // Load resume from resumes table
  React.useEffect(() => {
    if (resumeRecord?.content) {
      try {
        const parsed = JSON.parse(resumeRecord.content)
        setResume(parsed)
        prevResumeRef.current = resumeRecord.content
        setPrevResumeSnapshot(resumeRecord.content)
      } catch { /* ignore parse errors */ }
    } else if (resumeRecord === null) {
      // Session has no resume — clear
      setResume({})
      prevResumeRef.current = ""
      setPrevResumeSnapshot("")
    }
  }, [resumeRecord, setResume])
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

  // Use a ref so the transport body always reads the latest values
  // (useChat may not re-bind when the transport instance changes)
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
    [],
  )

  const { messages, sendMessage, addToolApprovalResponse, status, setMessages } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (err) => {
      toast.error(err.message || "Something went wrong")
    },
  })

  // Watch messages for tool approval requests (auto-approve) and completed tool outputs
  const processedToolCalls = React.useRef(new Set<string>())
  const currentMessagesRef = React.useRef<UIMessage[]>([])
  const hasHydratedMessagesRef = React.useRef(false)
  const isRestoringMessagesRef = React.useRef(false)

  React.useEffect(() => {
    currentMessagesRef.current = messages
  }, [messages])

  // Reset session-scoped UI state immediately on route change to avoid cross-session bleed.
  React.useEffect(() => {
    hasHydratedMessagesRef.current = false
    isRestoringMessagesRef.current = false
    setResume({})
    setMessages([])
    prevResumeRef.current = ""
    setPrevResumeSnapshot("")
    processedToolCalls.current.clear()
  }, [id, setResume, setMessages])

  // Flush latest chat snapshot before leaving current session route
  React.useEffect(() => {
    return () => {
      if (!id) return
      void fetch(`/api/sessions/${id}/messages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentMessagesRef.current),
      })
    }
  }, [id])

  // Restore messages from DB once loaded (including empty arrays)
  React.useEffect(() => {
    if (isMessagesLoading) return
    hasHydratedMessagesRef.current = true
    isRestoringMessagesRef.current = true
    setMessages(savedMessages ?? [])
  }, [savedMessages, isMessagesLoading, setMessages])

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
          output?: unknown
        }

        // Auto-approve if enabled
        if (
          toolPart.state === "approval-requested" &&
          toolPart.approval &&
          autoApprove &&
          (toolPart.toolName === "updateSection" || toolPart.type === "tool-updateSection")
        ) {
          addToolApprovalResponse({ id: toolPart.approval.id, approved: true })
        }

        // Sync Zustand from completed tool outputs
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

        // Toast on denial
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

  // Persist messages to DB (debounced — only when not streaming)
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    if (!id || isLoading || isMessagesLoading || !hasHydratedMessagesRef.current) return
    if (isRestoringMessagesRef.current) {
      isRestoringMessagesRef.current = false
      return
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void fetch(`/api/sessions/${id}/messages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      })
    }, 600)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [id, messages, isLoading, isMessagesLoading])
  // Persist resume changes back to resumes table
  React.useEffect(() => {
    if (!id || resumeRecord === undefined) return
    const json = JSON.stringify(resume)
    if (json !== prevResumeRef.current && json !== "{}") {
      prevResumeRef.current = json
      setPrevResumeSnapshot(json)
      if (resumeRecord?.id) {
        updateResumeMut.mutate({ id: resumeRecord.id, sessionId: id, content: json })
      } else {
        createResumeMut.mutate({ sessionId: id, title: "Resume", content: json })
      }
    }
  }, [resume, id, resumeRecord, updateResumeMut, createResumeMut])

  function handleToolApprove(approvalId: string) {
    addToolApprovalResponse({ id: approvalId, approved: true })
  }

  function handleToolReject(approvalId: string) {
    addToolApprovalResponse({ id: approvalId, approved: false })
  }

  function doUpload(file: File, message?: string) {
    const formData = new FormData()
    formData.append("sessionId", id)
    formData.append("file", file)
    // Pass provider settings so the server can parse md/txt with LLM
    const { provider: p, apiKey: k, baseURL: b, modelId: m } = settingsRef.current
    formData.append("provider", p)
    if (k) formData.append("apiKey", k)
    if (b) formData.append("baseURL", b)
    if (m) formData.append("modelId", m)
    fetch("/api/files", { method: "POST", body: formData })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((err: unknown) => {
            const error = err as { error?: string }
            throw new Error(error.error || "Upload failed")
          })
        }
        return res.json() as Promise<{ resumeJson?: Record<string, unknown> }>
      })
      .then((data) => {
        if (data.resumeJson) {
          setResume(data.resumeJson)
          settingsRef.current = { ...settingsRef.current, resume: data.resumeJson }
          prevResumeRef.current = JSON.stringify(data.resumeJson)
          setPrevResumeSnapshot(JSON.stringify(data.resumeJson))
        }
        sendMessage({ text: message || `Uploaded ${file.name}` })
      })
      .catch((err: Error) => {
        toast.error(`Upload failed: ${err.message}`)
      })
  }

  function handleFileWithConfirmation(file: File, message?: string) {
    if (resumeRecord) {
      // Already has a resume — ask for confirmation
      pendingFileRef.current = { file, message }
      setShowOverwriteDialog(true)
    } else {
      doUpload(file, message)
    }
  }

  function handleOverwriteConfirm() {
    setShowOverwriteDialog(false)
    if (pendingFileRef.current) {
      doUpload(pendingFileRef.current.file, pendingFileRef.current.message)
      pendingFileRef.current = null
    }
  }

  function handleOverwriteCancel() {
    setShowOverwriteDialog(false)
    pendingFileRef.current = null
  }

  function handleSend(message: string, files?: File[]) {
    if (files && files.length > 0) {
      handleFileWithConfirmation(files[0], message)
    } else {
      sendMessage({ text: message })
    }
  }

  function handleUpload(file: File) {
    handleFileWithConfirmation(file)
  }

  function handleCreateNew() {
    sendMessage({ text: "I want to create a new resume from scratch" })
  }

  const hasResume = Object.keys(resume).length > 0
  const showEmptyState = !hasResume && messages.length === 0

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
            className="flex-1"
          />
        ) : (
          <ChatPanel
            messages={messages}
            onSend={handleSend}
            onToolApprove={handleToolApprove}
            onToolReject={handleToolReject}
            isLoading={isLoading}
            hasResume={hasResume}
            className="flex-1"
          />
        )}
      </div>

      {/* Editor panel - right side */}
      <div className="hidden min-h-0 flex-1 md:flex md:flex-col">
        <EditorToolbar autoApprove={autoApprove} onAutoApproveChange={setAutoApprove} />
        <Tabs defaultValue="preview" className="flex min-h-0 flex-1 flex-col">
          <div className="border-b px-4">
            <TabsList className="h-10">
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
              <TabsTrigger value="diff">Changes</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="preview" className="m-0 min-h-0 flex-1 overflow-hidden">
            <ResumePreview resume={resume as JsonResume} className="h-full" />
          </TabsContent>
          <TabsContent value="json" className="m-0 flex-1 overflow-auto p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {JSON.stringify(resume, null, 2)}
            </pre>
          </TabsContent>
          <TabsContent value="diff" className="m-0 flex-1 overflow-hidden p-4">
            <DiffView
              before={prevResumeSnapshot || "{}"}
              after={JSON.stringify(resume, null, 2)}
              className="h-full"
            />
          </TabsContent>
          <TabsContent value="history" className="m-0 flex-1 overflow-hidden">
            <ChangeHistory className="h-full" />
          </TabsContent>
        </Tabs>
      </div>

      {/* Overwrite confirmation dialog */}
      <Dialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace existing resume?</DialogTitle>
            <DialogDescription>
              This session already has a resume. Uploading a new file will replace the current content. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleOverwriteCancel}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleOverwriteConfirm}>
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
