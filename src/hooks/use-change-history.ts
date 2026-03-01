import { create } from "zustand"

export interface ChangeEntry {
  id: string
  path: string
  oldValue: unknown
  newValue: unknown
  timestamp: number
  toolCallId?: string
  source: "ai" | "manual"
}

interface ChangeHistoryState {
  changes: ChangeEntry[]
  addChange: (entry: Omit<ChangeEntry, "id" | "timestamp">) => void
  clearChanges: () => void
}

let nextId = 0

export const useChangeHistory = create<ChangeHistoryState>((set) => ({
  changes: [],

  addChange: (entry) =>
    set((state) => ({
      changes: [
        ...state.changes,
        { ...entry, id: String(nextId++), timestamp: Date.now() },
      ],
    })),

  clearChanges: () => set({ changes: [] }),
}))
