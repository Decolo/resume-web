"use client"

import * as React from "react"
import type { UIMessage } from "ai"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ToolApprovalCard } from "@/components/chat/tool-approval-card"
import { cn } from "@/lib/utils"

interface MessageListProps {
  messages: UIMessage[]
  onToolApprove?: (id: string) => void
  onToolReject?: (id: string) => void
  className?: string
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex gap-3">
      <Avatar size="sm">
        <AvatarFallback>U</AvatarFallback>
      </Avatar>
      <div className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm">
        {content}
      </div>
    </div>
  )
}

function AssistantTextPart({ text }: { text: string }) {
  return (
    <div className="flex gap-3">
      <Avatar size="sm">
        <AvatarFallback className="bg-primary text-primary-foreground">
          AI
        </AvatarFallback>
      </Avatar>
      <div
        className="prose prose-sm dark:prose-invert max-w-none flex-1 text-sm"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
      />
    </div>
  )
}

function ToolResultBadge({ toolName, state }: { toolName: string; state: string }) {
  const variant = state === "output-available" ? "default" : "destructive"
  const label = state === "output-available" ? "done" : state === "output-denied" ? "denied" : state
  return (
    <div className="ml-11 flex items-center gap-2 py-1">
      <Badge variant="outline" className="font-mono text-xs">
        {toolName}
      </Badge>
      <Badge variant={variant} className="text-xs">
        {label}
      </Badge>
    </div>
  )
}

/**
 * Minimal markdown-to-HTML: handles **bold**, *italic*, `code`,
 * code blocks, and newlines.
 */
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
  html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 rounded text-xs">$1</code>')
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")
  html = html.replace(/\n/g, "<br/>")
  return html
}

export function MessageList({ messages, onToolApprove, onToolReject, className }: MessageListProps) {
  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      {messages.map((msg) => {
        if (msg.role === "user") {
          const text = msg.parts
            ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("") ?? ""
          return <UserMessage key={msg.id} content={text} />
        }

        if (msg.role === "assistant") {
          return (
            <div key={msg.id} className="flex flex-col gap-2">
              {msg.parts?.map((part, i) => {
                if (part.type === "text" && part.text) {
                  return <AssistantTextPart key={i} text={part.text} />
                }

                // Tool parts: type is "tool-<toolName>"
                if (part.type.startsWith("tool-")) {
                  const toolPart = part as unknown as {
                    type: string
                    toolCallId: string
                    toolName: string
                    state: string
                    input: { path: string; value: unknown }
                    approval?: { id: string }
                  }

                  if (toolPart.state === "approval-requested" && toolPart.approval && onToolApprove && onToolReject) {
                    return (
                      <ToolApprovalCard
                        key={toolPart.toolCallId}
                        toolName={toolPart.toolName ?? toolPart.type.replace("tool-", "")}
                        input={toolPart.input}
                        approvalId={toolPart.approval.id}
                        onApprove={onToolApprove}
                        onReject={onToolReject}
                      />
                    )
                  }

                  if (toolPart.state === "output-available" || toolPart.state === "output-denied") {
                    return (
                      <ToolResultBadge
                        key={toolPart.toolCallId}
                        toolName={toolPart.toolName ?? toolPart.type.replace("tool-", "")}
                        state={toolPart.state}
                      />
                    )
                  }

                  // "partial-call" or "call" — show a pending indicator
                  return (
                    <div key={toolPart.toolCallId ?? i} className="ml-11 flex items-center gap-2 py-1">
                      <Badge variant="outline" className="font-mono text-xs">
                        {toolPart.toolName ?? toolPart.type.replace("tool-", "")}
                      </Badge>
                      <span className="text-xs text-muted-foreground animate-pulse">running…</span>
                    </div>
                  )
                }

                return null
              })}
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
