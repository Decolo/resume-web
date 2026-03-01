import { create } from "zustand"
import type { JsonResume } from "@/components/editor/resume-preview"
import { useChangeHistory } from "@/hooks/use-change-history"
import { getByPath, setByPath } from "@/lib/domain/path"

interface ResumeState {
  resume: JsonResume
  history: JsonResume[]
  historyIndex: number
  setResume: (resume: JsonResume) => void
  updateSection: (path: string, value: unknown, meta?: { toolCallId?: string; source?: "ai" | "manual" }) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

export const useResume = create<ResumeState>((set, get) => ({
  resume: {},
  history: [{}],
  historyIndex: 0,

  setResume: (resume) =>
    set({ resume, history: [resume], historyIndex: 0 }),

  updateSection: (path, value, meta) => {
    const { resume, history, historyIndex } = get()
    const oldValue = getByPath(resume as Record<string, unknown>, path)
    const updated = setByPath(resume as Record<string, unknown>, path, value) as JsonResume
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(updated)
    set({ resume: updated, history: newHistory, historyIndex: newHistory.length - 1 })

    useChangeHistory.getState().addChange({
      path,
      oldValue,
      newValue: value,
      toolCallId: meta?.toolCallId,
      source: meta?.source ?? "manual",
    })
  },

  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex > 0) {
      set({ resume: history[historyIndex - 1], historyIndex: historyIndex - 1 })
    }
  },

  redo: () => {
    const { history, historyIndex } = get()
    if (historyIndex < history.length - 1) {
      set({ resume: history[historyIndex + 1], historyIndex: historyIndex + 1 })
    }
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,
}))
