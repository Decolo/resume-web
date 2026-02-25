"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { ChatPanel } from "@/components/chat/chat-panel"
import { EmptyState } from "@/components/chat/empty-state"
import { ResumePreview, type JsonResume } from "@/components/editor/resume-preview"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DiffView } from "@/components/editor/diff-view"
import { useResume } from "@/hooks/use-resume"
import { useSession, useUpdateSession } from "@/hooks/use-sessions"
import type { ChatMessage } from "@/components/chat/message-list"

export default function SessionPage() {
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

  // Read settings from localStorage
  React.useEffect(() => {
    const stored = localStorage.getItem("resume-agent-api-key") ?? ""
    const storedProvider = localStorage.getItem("resume-agent-provider") as typeof provider ?? "gemini"
    const storedBaseURL = localStorage.getItem("resume-agent-base-url") ?? ""
    const storedModelId = localStorage.getItem("resume-agent-model-id") ?? ""
    setApiKey(stored)
    setProvider(storedProvider)
    setBaseURL(storedBaseURL)
    setModelId(storedModelId)
  }, [])

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          provider,
          apiKey,
          baseURL: baseURL || undefined,
          modelId: modelId || undefined,
          resume,
        }),
      }),
    [provider, apiKey, baseURL, modelId, resume],
  )

  const { messages, sendMessage, status } = useChat({
    transport,
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName === "updateSection") {
        const input = (toolCall as unknown as { input: { path: string; value: unknown } }).input
        updateSection(input.path, input.value)
      }
    },
  })

  const isLoading = status === "submitted" || status === "streaming"

  // Persist resume changes back to session
  React.useEffect(() => {
    const json = JSON.stringify(resume)
    if (id && json !== prevResumeRef.current && json !== "{}") {
      prevResumeRef.current = json
      setPrevResumeSnapshot(json)
      updateSession.mutate({ id, resumeJson: json })
    }
  }, [resume, id, updateSession])

  const chatMessages: ChatMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role as ChatMessage["role"],
    content: m.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("") ?? "",
  }))

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
            prevResumeRef.current = JSON.stringify(data.resumeJson)
            setPrevResumeSnapshot(JSON.stringify(data.resumeJson))
          }
          sendMessage({ text: message || `Uploaded ${files[0].name}` })
        })
        .catch((err: Error) => {
          console.error("Upload failed:", err)
          sendMessage({ text: `Failed to upload ${files[0].name}: ${err.message}` })
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
          prevResumeRef.current = JSON.stringify(data.resumeJson)
          setPrevResumeSnapshot(JSON.stringify(data.resumeJson))
        }
        sendMessage({ text: `Uploaded ${file.name}` })
      })
      .catch((err: Error) => {
        console.error("Upload failed:", err)
        sendMessage({ text: `Failed to upload ${file.name}: ${err.message}` })
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
            messages={chatMessages}
            onSend={handleSend}
            isLoading={isLoading}
            hasResume={hasResume}
            className="flex-1"
          />
        )}
      </div>

      {/* Editor panel - right side */}
      <div className="hidden flex-1 md:flex md:flex-col">
        <Tabs defaultValue="preview" className="flex flex-1 flex-col">
          <div className="border-b px-4">
            <TabsList className="h-10">
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
              <TabsTrigger value="diff">Changes</TabsTrigger>
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
        </Tabs>
      </div>
    </div>
  )
}
