"use client"

import * as React from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { diffObjects } from "@/lib/domain/diff"

interface DiffViewProps {
  before: string
  after: string
  className?: string
}function formatValue(val: unknown): string {
  if (val === undefined) return "(empty)"
  if (typeof val === "string") return val
  return JSON.stringify(val, null, 2)
}

export function DiffView({ before, after, className }: DiffViewProps) {
  const diffs = React.useMemo(() => {
    try {
      const oldObj = JSON.parse(before)
      const newObj = JSON.parse(after)
      return diffObjects(oldObj, newObj)
    } catch {
      return []
    }
  }, [before, after])

  if (diffs.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-sm text-muted-foreground", className)}>
        No changes
      </div>
    )
  }

  return (
    <ScrollArea className={cn("rounded-md border", className)}>
      <div className="divide-y">
        {diffs.map((diff) => (
          <div key={diff.path} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <code className="text-xs font-medium">{diff.path}</code>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                  diff.type === "added" && "bg-green-500/10 text-green-700 dark:text-green-400",
                  diff.type === "removed" && "bg-red-500/10 text-red-700 dark:text-red-400",
                  diff.type === "changed" && "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
                )}
              >
                {diff.type}
              </span>
            </div>
            <div className="mt-1 text-xs">
              {diff.type !== "added" && (
                <pre className="whitespace-pre-wrap text-red-500 line-through">{formatValue(diff.old)}</pre>
              )}
              {diff.type !== "removed" && (
                <pre className="whitespace-pre-wrap text-green-600">{formatValue(diff.new)}</pre>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
