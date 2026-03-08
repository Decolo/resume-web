"use client"

import * as React from "react"
import { FileTextIcon, ChevronDownIcon, PlusIcon } from "lucide-react"
import { Undo2, Redo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { formatResumeTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useResume } from "@/hooks/use-resume"
import type { ResumeRecord } from "@/hooks/use-sessions"

interface EditorToolbarProps {
  autoApprove: boolean
  onAutoApproveChange: (value: boolean) => void
  resumes: ResumeRecord[]
  selectedResume: ResumeRecord | null
  onSelectResume: (resume: ResumeRecord) => void
  onCreateResume: () => void
  isCreateDisabled: boolean
}

export function EditorToolbar({
  autoApprove,
  onAutoApproveChange,
  resumes,
  selectedResume,
  onSelectResume,
  onCreateResume,
  isCreateDisabled,
}: EditorToolbarProps) {
  const canUndo = useResume((s) => s.canUndo())
  const canRedo = useResume((s) => s.canRedo())
  const undo = useResume((s) => s.undo)
  const redo = useResume((s) => s.redo)

  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex items-center gap-2 border-b px-4 py-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={undo}
        disabled={!canUndo}
        title="Undo"
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={redo}
        disabled={!canRedo}
        title="Redo"
      >
        <Redo2 className="h-4 w-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-48 gap-1.5">
            <FileTextIcon className="size-4 shrink-0" />
            <span className="truncate">
              {selectedResume?.title ?? "No resume"}
            </span>
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          {resumes.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              No resumes yet
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              {resumes.map((record) => {
                const isActive = record.id === selectedResume?.id
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => {
                      onSelectResume(record)
                      setOpen(false)
                    }}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <p className="truncate text-sm font-medium">
                      {record.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatResumeTimestamp(record.updatedAt)}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
          <Separator className="my-1.5" />
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-1.5"
            onClick={() => {
              onCreateResume()
              setOpen(false)
            }}
            disabled={isCreateDisabled}
          >
            <PlusIcon className="size-4" />
            New resume
          </Button>
        </PopoverContent>
      </Popover>

      <div className="ml-auto flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => onAutoApproveChange(e.target.checked)}
            className="accent-primary"
          />
          Auto-approve
        </label>
      </div>
    </div>
  )
}
