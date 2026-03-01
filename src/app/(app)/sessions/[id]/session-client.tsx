"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
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
import { useSession, useUpdateSession } from "@/hooks/use-sessions"

export default function SessionClient() {
  const { id } = useParams<{ id: string }>()
  const { data: session } = useSession(id)
  const updateSession = useUpdateSession()
  const { resume, setResume, updateSection } = useResume()
  const [apiKey, setApiKey] = React.useState("")
  const [provider, setProvider] = React.useState<"openai" | "gemini">("gemini")
  const [baseURL, setBaseURL] = React.useState("")
  const [modelId, setModelId] = React.useState("")
  const prevResumeRef = React.useRef<string>("")
  const [prevResumeSnapshot, setPrevResumeSnapshot] = React.useState<string>("")
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

  // Load resume from session on mount
  React.useEffect(() => {
    if (session?.resumeJson) {
      try {
        const parsed = JSON.parse(session.resumeJson)
        setResume(parsed)
        prevResumeRef.current = session.resumeJson
        setPrevResumeSnapshot(session.resumeJson)
      } catch { /* ignore parse errors */ }
    }
  }, [session?.resumeJson, setResume])
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const { messages, sendMessage, addToolApprovalResponse, status } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (err) => {
      toast.error(err.message || "Something went wrong")
    },
  })

  const isLoading = status === "submitted" || status === "streaming"

  // Watch messages for tool approval requests (auto-approve) and completed tool outputs
  const processedToolCalls = React.useRef(new Set<string>())

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
  // Persist resume changes back to session
  React.useEffect(() => {
    const json = JSON.stringify(resume)
    if (id && json !== prevResumeRef.current && json !== "{}") {
      prevResumeRef.current = json
      setPrevResumeSnapshot(json)
      updateSession.mutate({ id, resumeJson: json })
    }
  }, [resume, id, updateSession])

  function handleToolApprove(approvalId: string) {
    addToolApprovalResponse({ id: approvalId, approved: true })
  }

  function handleToolReject(approvalId: string) {
    addToolApprovalResponse({ id: approvalId, approved: false })
  }

  function handleSend(message: string, files?: File[]) {
    if (files && files.length > 0) {
      const formData = new FormData()
      formData.append("sessionId", id)
      formData.append("file", files[0])
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
          sendMessage({ text: message || `Uploaded ${files[0].name}` })
        })
        .catch((err: Error) => {
          toast.error(`Upload failed: ${err.message}`)
        })
    } else {
      sendMessage({ text: message })
    }
  }

  function handleUpload(file: File) {
    const formData = new FormData()
    formData.append("sessionId", id)
    formData.append("file", file)
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
        sendMessage({ text: `Uploaded ${file.name}` })
      })
      .catch((err: Error) => {
        toast.error(`Upload failed: ${err.message}`)
      })
  }

  function handleCreateNew() {
    sendMessage({ text: "I want to create a new resume from scratch" })
  }

  const hasResume = Object.keys(resume).length > 0
  const showEmptyState = !hasResume && messages.length === 0

  return (
    <div className="flex h-full">
      {/* Chat panel - left side */}
      <div className="flex w-full flex-col border-r md:w-1/2">
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
      <div className="hidden flex-1 md:flex md:flex-col">
        <EditorToolbar autoApprove={autoApprove} onAutoApproveChange={setAutoApprove} />
        <Tabs defaultValue="preview" className="flex flex-1 flex-col">
          <div className="border-b px-4">
            <TabsList className="h-10">
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
              <TabsTrigger value="diff">Changes</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="preview" className="flex-1 overflow-hidden m-0">
            <ResumePreview resume={resume as JsonResume} />
          </TabsContent>
          <TabsContent value="json" className="flex-1 overflow-auto m-0 p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {JSON.stringify(resume, null, 2)}
            </pre>
          </TabsContent>
          <TabsContent value="diff" className="flex-1 overflow-hidden m-0 p-4">
            <DiffView
              before={prevResumeSnapshot || "{}"}
              after={JSON.stringify(resume, null, 2)}
              className="h-full"
            />
          </TabsContent>
          <TabsContent value="history" className="flex-1 overflow-hidden m-0">
            <ChangeHistory className="h-full" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
