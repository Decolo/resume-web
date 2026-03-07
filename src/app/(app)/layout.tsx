"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { Sidebar, MobileSidebar, type Session } from "@/components/layout/sidebar"
import { Header, type Provider } from "@/components/layout/header"
import { useSessions, useCreateSession, useDeleteSession } from "@/hooks/use-sessions"
import {
  getActiveProvider,
  setActiveProvider,
  SETTINGS_CHANGED_EVENT,
} from "@/lib/settings"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: sessions = [] } = useSessions()
  const createSession = useCreateSession()
  const deleteSession = useDeleteSession()
  const [provider, setProvider] = React.useState<Provider>("gemini")
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null)

  // Sync provider from localStorage on mount + when settings change (same-tab & cross-tab)
  React.useEffect(() => {
    function sync() {
      setProvider(getActiveProvider())
    }
    sync()
    window.addEventListener(SETTINGS_CHANGED_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  function handleProviderChange(next: Provider) {
    setActiveProvider(next)
    setProvider(next)
  }

  const activeSessionId = pathname.match(/\/sessions\/(.+)/)?.[1]

  const sidebarSessions: Session[] = sessions.map((s) => ({
    id: s.id,
    title: s.workflowState === "draft" ? "New Session" : `Session ${s.id.slice(0, 8)}`,
    updatedAt: new Date(s.updatedAt),
  }))

  function handleSelectSession(id: string) {
    router.push(`/sessions/${id}`)
  }

  async function handleNewSession() {
    const session = await createSession.mutateAsync({ provider })
    router.push(`/sessions/${session.id}`)
  }

  function handleDeleteClick(id: string) {
    setDeleteTargetId(id)
  }

  async function handleDeleteConfirm() {
    if (!deleteTargetId) return
    const targetId = deleteTargetId
    setDeleteTargetId(null)

    try {
      await deleteSession.mutateAsync(targetId)
      if (activeSessionId === targetId) {
        const fallback = sidebarSessions.find((s) => s.id !== targetId)
        router.push(fallback ? `/sessions/${fallback.id}` : "/sessions")
      }
      toast.success("Session deleted")
    } catch (error) {
      const err = error as Error
      toast.error(err.message || "Failed to delete session")
    }
  }

  const sidebarProps = {
    sessions: sidebarSessions,
    activeSessionId,
    onSelectSession: handleSelectSession,
    onNewSession: handleNewSession,
    onDeleteSession: handleDeleteClick,
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar {...sidebarProps} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          provider={provider}
          onProviderChange={handleProviderChange}
          onSettingsClick={() => router.push("/settings")}
          leading={<MobileSidebar {...sidebarProps} />}
        />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>

      <Dialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete session?</DialogTitle>
            <DialogDescription>
              This will permanently remove the session, including its messages and resume.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTargetId(null)}
              disabled={deleteSession.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteSession.isPending}
            >
              {deleteSession.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
