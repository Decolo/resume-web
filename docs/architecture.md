# Architecture

## Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI**: React 19, shadcn/ui (new-york), Tailwind CSS
- **State**: Zustand (client), TanStack Query (server)
- **AI**: Vercel AI SDK v6 (`@ai-sdk/react`, `ai`)
- **DB**: Drizzle ORM — better-sqlite3 (local), Cloudflare D1 (prod)
- **Storage**: Cloudflare R2 (file uploads, optional in dev)
- **Deploy**: Cloudflare Pages

## Layers

```
src/
├── app/                  Next.js routes + API handlers
│   ├── (app)/            Client pages (sessions, settings)
│   └── api/              Server endpoints (chat, sessions, files, export)
├── components/           React UI
│   ├── chat/             Chat panel, message list, tool approval card
│   ├── editor/           Resume preview, diff view, change history, toolbar
│   ├── layout/           Sidebar, header
│   └── ui/               shadcn primitives
├── hooks/                Client state
│   ├── use-resume.ts     Resume Zustand store (undo/redo, updateSection)
│   ├── use-change-history.ts  Change log Zustand store
│   └── use-sessions.ts   React Query hooks for session CRUD
├── lib/
│   ├── ai/               Tool definitions, prompts, provider config
│   ├── db/               Drizzle schema, queries, db init
│   ├── domain/           Pure logic (ATS scorer, job matcher, validator, parser)
│   └── storage/          R2 upload helper
```

## Data Flow

1. User uploads resume or starts from scratch → stored in session DB
2. User sends chat message → `POST /api/chat` with current resume + messages
3. Server calls `streamText()` with tools; streams `UIMessageStreamResponse`
4. Client (`useChat`) receives streamed parts
5. `updateSection` tool parts with `state: approval-requested` → render `ToolApprovalCard`
6. User approves → `addToolApprovalResponse()` → tool executes server-side
7. `state: output-available` part arrives → `updateSection()` called on Zustand store
8. Zustand mutation persists resume back to DB via `PATCH /api/sessions/[id]`

## State Management

| Store | Contents |
|-------|----------|
| `useResume` | Resume JSON, history stack, undo/redo |
| `useChangeHistory` | Timestamped change log (path, old/new value, source) |
| React Query | Session list, individual session data |
| localStorage | API key, provider, base URL, model ID, auto-approve toggle |

## AI Integration

**Providers**: Gemini (`gemini-2.0-flash`), OpenAI (`gpt-4o`), any OpenAI-compatible API.

**Tool approval flow** (AI SDK v6 native):
- `needsApproval: true` on `updateSection` pauses execution
- `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` auto-continues after all approvals
- Auto-approve toggle bypasses the card UI

**Stopping condition**: `stopWhen: stepCountIs(5)` — max 5 tool steps per turn.

## Database Schema

```
sessions   id, resumeJson, jdText, workflowState, provider, createdAt, updatedAt
messages   id, sessionId (FK), role, content, toolCalls, createdAt
```
