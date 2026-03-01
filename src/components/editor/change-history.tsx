"use client"

import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useChangeHistory, type ChangeEntry } from "@/hooks/use-change-history"
import { cn } from "@/lib/utils"

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function summarize(value: unknown): string {
  if (value === undefined) return "(empty)"
  if (typeof value === "string") return value.length > 60 ? value.slice(0, 60) + "…" : value
  return JSON.stringify(value)?.slice(0, 60) ?? "(empty)"
}

function ChangeItem({ entry }: { entry: ChangeEntry }) {
  return (
    <div className="border-b px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <code className="text-xs font-medium">{entry.path}</code>
        <Badge variant={entry.source === "ai" ? "default" : "secondary"} className="text-[10px]">
          {entry.source}
        </Badge>
        <span className="ml-auto text-[10px] text-muted-foreground">{relativeTime(entry.timestamp)}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        <span className="text-red-500 line-through">{summarize(entry.oldValue)}</span>
        {" → "}
        <span className="text-green-600">{summarize(entry.newValue)}</span>
      </div>
    </div>
  )
}

export function ChangeHistory({ className }: { className?: string }) {
  const changes = useChangeHistory((s) => s.changes)
  const reversed = [...changes].reverse()

  if (reversed.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-sm text-muted-foreground", className)}>
        No changes yet
      </div>
    )
  }

  return (
    <ScrollArea className={cn("h-full", className)}>
      {reversed.map((entry) => (
        <ChangeItem key={entry.id} entry={entry} />
      ))}
    </ScrollArea>
  )
}
