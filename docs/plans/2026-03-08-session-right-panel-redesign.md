# Session Right Panel Redesign

## Problem

The session page (`/sessions/[id]`) right panel crams 4 sections vertically: toolbar, resume selector list, preview, and diff view. Each gets insufficient vertical space, especially Preview and Diff which are content-heavy.

## Decision: Tab Panel (Approach A)

### Layout: Before → After

**Before:**
```
┌──────────────────────────────┐
│ ⟲ ⟳              ☐ Auto      │  toolbar
├──────────────────────────────┤
│ Resumes         + New resume │  resume selector (always visible list)
│ │ Resume 1                 │ │
│ │ Resume 2                 │ │
├──────────────────────────────┤
│ Preview           (~33% h)   │
├──────────────────────────────┤
│ Field diff        (~33% h)   │
└──────────────────────────────┘
```

**After:**
```
┌──────────────────────────────┐
│ ⟲ ⟳  [📄 Resume 1 ▾]  ☐ Auto│  toolbar + resume dropdown
├──────────────────────────────┤
│ [Preview]  [Diff ●]          │  tab bar
├──────────────────────────────┤
│                              │
│  (full remaining height      │
│   for active tab content)    │
│                              │
└──────────────────────────────┘
```

### Change 1: Resume Selector → Popover Dropdown

- Replace always-visible resume list with a `Popover` triggered from toolbar
- Trigger button: document icon + active resume name + chevron
- Popover contents: resume list (name + timestamp) + "New resume" button
- Closes on selection

### Change 2: Preview & Diff → Tabs

- Use shadcn `Tabs` component
- Two tabs: "Preview" (default active), "Diff"
- Active tab content gets all remaining vertical space (`flex-1 min-h-0`)
- Diff tab shows a dot badge when diff is non-empty
- No animation, instant switch
- Scroll position preserved per tab

### Files Modified

- `session-client.tsx` — restructure right panel layout
- Possibly extract resume selector popover component

### Files Unchanged

- `resume-preview.tsx` — re-parented into TabsContent, no internal changes
- `diff-view.tsx` — re-parented into TabsContent, no internal changes
- `chat-panel.tsx`, left sidebar — untouched

### New Dependencies

- shadcn `Tabs` (if not present)
- shadcn `Popover` (if not present)

### No Behavioral Changes

Resume switching, preview rendering, diff computation logic all unchanged. This is purely a layout/container restructure.
