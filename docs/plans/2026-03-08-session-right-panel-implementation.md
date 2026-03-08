# Session Right Panel Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the cramped 4-section vertical stack in the session right panel with a toolbar+dropdown+tabs layout so Preview/Diff each get full height.

**Architecture:** Move resume selector into a Popover inside the existing EditorToolbar. Replace the `grid-rows-2` Preview/Diff split with shadcn Tabs. No behavioral changes — purely layout restructure.

**Tech Stack:** React, shadcn/ui (Tabs, Popover), Tailwind CSS, Radix primitives.

---

### Task 1: Add shadcn Popover component

**Files:**
- Create: `src/components/ui/popover.tsx` (via shadcn CLI)

**Step 1: Install Popover**

Run: `pnpm dlx shadcn@latest add popover`

**Step 2: Verify file exists**

Run: `ls src/components/ui/popover.tsx`
Expected: file exists

**Step 3: Commit**

```bash
git add src/components/ui/popover.tsx
git commit -m "chore: add shadcn popover component"
```

---

### Task 2: Add resume selector dropdown to EditorToolbar

**Files:**
- Modify: `src/components/editor/editor-toolbar.tsx`

**Step 1: Extend EditorToolbar props and add Popover**

Add new props to `EditorToolbarProps`:

```ts
interface EditorToolbarProps {
  autoApprove: boolean
  onAutoApproveChange: (value: boolean) => void
  // NEW:
  resumes: ResumeRecord[]
  selectedResume: ResumeRecord | null
  onSelectResume: (resume: ResumeRecord) => void
  onCreateResume: () => void
  isCreateDisabled: boolean
}
```

Add a Popover between undo/redo buttons and auto-approve checkbox. Trigger button shows `FileTextIcon` + selected resume title + `ChevronDownIcon`. Popover contents: list of resume buttons (name + timestamp) + "New resume" button at bottom. Use `formatResumeTimestamp` (move to shared util or inline).

The Popover trigger should look like:
```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm" className="ml-2 max-w-48 gap-1.5">
      <FileTextIcon className="size-3.5" />
      <span className="truncate">{selectedResume?.title ?? "No resume"}</span>
      <ChevronDownIcon className="size-3.5 opacity-50" />
    </Button>
  </PopoverTrigger>
  <PopoverContent align="start" className="w-64 p-0">
    {/* resume list items */}
    {/* + New resume button */}
  </PopoverContent>
</Popover>
```

Each resume item in the popover:
```tsx
<button
  onClick={() => { onSelectResume(record); setOpen(false); }}
  className={cn(
    "flex w-full flex-col px-3 py-2 text-left hover:bg-muted/50",
    isActive && "bg-primary/5"
  )}
>
  <span className="truncate text-sm font-medium">{record.title}</span>
  <span className="text-xs text-muted-foreground">Updated {formatTimestamp(record.updatedAt)}</span>
</button>
```

**Step 2: Build and verify no type errors**

Run: `pnpm build`
Expected: build succeeds (note: the new props aren't passed yet, so the call site in session-client will type-error — that's expected and fixed in Task 3)

Actually — skip build here, we'll wire it up in Task 3 and build then.

**Step 3: Commit**

```bash
git add src/components/editor/editor-toolbar.tsx
git commit -m "feat: add resume selector popover to EditorToolbar"
```

---

### Task 3: Restructure session-client right panel

**Files:**
- Modify: `src/app/(app)/sessions/[id]/session-client.tsx` (lines 634-722)

This is the main layout change. Replace the right panel section (lines 634-722) with the new structure.

**Step 1: Update imports**

Add to imports:
```ts
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
```

Remove `ScrollArea` from imports if no longer used elsewhere in this file (check — it's not used elsewhere after removing the resume list scroll area). Also remove `PlusIcon` and `FileTextIcon` since those move into EditorToolbar.

**Step 2: Replace the right panel JSX**

Replace lines 635-721 (the entire `<div className="hidden min-h-0 flex-1 md:flex md:flex-col">` block) with:

```tsx
<div className="hidden min-h-0 flex-1 md:flex md:flex-col">
  <EditorToolbar
    autoApprove={autoApprove}
    onAutoApproveChange={setAutoApprove}
    resumes={resumeRecords}
    selectedResume={selectedResume}
    onSelectResume={handleSelectResume}
    onCreateResume={handleCreateResume}
    isCreateDisabled={createResumeMut.isPending || isUploadingResume || isLoading}
  />

  <Tabs defaultValue="preview" className="flex min-h-0 flex-1 flex-col">
    <TabsList variant="line" className="w-full justify-start border-b px-4">
      <TabsTrigger value="preview">Preview</TabsTrigger>
      <TabsTrigger value="diff" className="gap-1.5">
        Diff
        {hasDiffChanges && (
          <span className="size-1.5 rounded-full bg-foreground" />
        )}
      </TabsTrigger>
    </TabsList>

    <TabsContent value="preview" className="min-h-0">
      <ResumePreview resume={resume as JsonResume} className="h-full" />
    </TabsContent>

    <TabsContent value="diff" className="min-h-0 p-4">
      <DiffView
        before={diffBaseSnapshot || "{}"}
        after={JSON.stringify(resume, null, 2)}
        className="h-full"
      />
    </TabsContent>
  </Tabs>
</div>
```

**Step 3: Add `hasDiffChanges` memo**

Add near other memos in SessionClient:

```ts
const hasDiffChanges = React.useMemo(() => {
  try {
    const before = JSON.parse(diffBaseSnapshot || "{}")
    const after = resume
    return JSON.stringify(before) !== JSON.stringify(after)
  } catch {
    return false
  }
}, [diffBaseSnapshot, resume])
```

**Step 4: Clean up unused imports**

Remove `ScrollArea`, `PlusIcon`, `FileTextIcon` from session-client imports if no longer used there. Keep `cn` if still used.

**Step 5: Build and verify**

Run: `pnpm build`
Expected: build succeeds with no type errors

**Step 6: Commit**

```bash
git add src/app/(app)/sessions/[id]/session-client.tsx
git commit -m "feat: restructure right panel with tabs and resume dropdown"
```

---

### Task 4: Visual QA in browser

**Step 1: Start dev server if not running**

Run: `pnpm dev` (if not already running)

**Step 2: Open a session page and verify**

Check in browser at `http://localhost:3000/sessions/<id>`:
- Toolbar shows undo/redo + resume dropdown + auto-approve
- Resume dropdown opens popover with resume list and "New resume" button
- Selecting a resume closes popover and switches
- Preview tab is default, shows full-height resume
- Diff tab shows diff content with full height
- Diff tab has dot badge when changes exist
- Mobile: right panel still hidden, chat takes full width

**Step 3: Fix any visual issues found**

**Step 4: Commit any fixes**

---

### Task 5: Update docs

**Files:**
- Modify: `docs/features.md` (if it mentions the right panel layout)
- Modify: `docs/plans/2026-03-08-session-right-panel-redesign.md` — add "Implemented" note

**Step 1: Update design doc with implementation status**

Add at top of design doc: `> **Status:** Implemented`

**Step 2: Commit**

```bash
git add docs/
git commit -m "docs: mark right panel redesign as implemented"
```
