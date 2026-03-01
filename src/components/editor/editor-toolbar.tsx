"use client"

import { Button } from "@/components/ui/button"
import { Undo2, Redo2 } from "lucide-react"
import { useResume } from "@/hooks/use-resume"

interface EditorToolbarProps {
  autoApprove: boolean
  onAutoApproveChange: (value: boolean) => void
}

export function EditorToolbar({ autoApprove, onAutoApproveChange }: EditorToolbarProps) {
  const canUndo = useResume((s) => s.canUndo())
  const canRedo = useResume((s) => s.canRedo())
  const undo = useResume((s) => s.undo)
  const redo = useResume((s) => s.redo)

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
