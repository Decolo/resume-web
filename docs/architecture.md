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
│   └── api/              Server endpoints (chat, sessions, files, export, stt)
├── components/           React UI
│   ├── chat/             Chat panel, message list, tool approval card
│   ├── editor/           Resume preview, diff view, change history, toolbar
│   ├── layout/           Sidebar, header
│   └── ui/               shadcn primitives
├── hooks/                Client state
│   ├── use-resume.ts     Resume Zustand store (undo/redo, updateSection)
│   ├── use-change-history.ts  Change log Zustand store
│   ├── use-sessions.ts   React Query hooks for session CRUD
│   └── use-recorded-transcription.ts  Click-controlled recording + upload transcription
├── lib/
│   ├── ai/               Tool definitions, prompts, provider config
│   ├── db/               Drizzle schema, queries, db init
│   ├── domain/           Pure logic (ATS scorer, job matcher, validator, parser)
│   └── storage/          R2 upload helper
```

## Data Flow

1. User uploads resume or starts from scratch → stored as a new row in `resumes` table (1:N per session)
2. Session switch → `GET /api/sessions/:id/resumes` → loads all resumes in that session
3. User sends chat message → `POST /api/chat` with current resume + messages
4. Server calls `streamText()` with tools; streams `UIMessageStreamResponse`
5. Client (`useChat`) receives streamed parts
6. `updateSection` tool parts with `state: approval-requested` → render `ToolApprovalCard`
7. User approves → `addToolApprovalResponse()` → tool executes server-side
8. `state: output-available` part arrives → `updateSection()` called on Zustand store
9. Zustand mutation persists the selected resume back to DB via `PUT /api/resumes/[id]`
10. Selecting a different resume updates preview + diff baseline and appends a chat notice

### Voice Input (STT) Flow

1. User clicks record in chat input or `/demo`
2. `useRecordedTranscription` requests microphone permission and records audio via `MediaRecorder`
3. User clicks again to stop recording
4. Browser uploads audio to `POST /api/stt/transcribe` as `multipart/form-data`
5. Server calls ElevenLabs `POST /v1/speech-to-text` using `ELEVENLABS_API_KEY`
6. Transcript text is returned to the client and appended to existing textarea content

Note: current implementation does not use browser Web Speech API for production STT; transcription is done server-side via ElevenLabs.

## State Management

| Store | Contents |
|-------|----------|
| `useResume` | Resume JSON, history stack, undo/redo |
| `useChangeHistory` | Timestamped change log (path, old/new value, source) |
| React Query | Session list, individual session data, session resume list |
| localStorage | API key, provider, base URL, model ID, auto-approve toggle, STT language code (`sttLanguage`) |

## AI Integration

**Providers**: Gemini (`gemini-2.0-flash`), OpenAI (`gpt-4o`), any OpenAI-compatible API.

**Tool approval flow** (AI SDK v6 native):
- `needsApproval: true` on `updateSection` pauses execution
- `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` auto-continues after all approvals
- Auto-approve toggle bypasses the card UI

**Stopping condition**: `stopWhen: stepCountIs(5)` — max 5 tool steps per turn.

## Database Schema

```
sessions   id, resumeJson (legacy), jdText, workflowState, provider, createdAt, updatedAt
resumes    id, sessionId (FK, cascade), title, content, createdAt, updatedAt
messages   id, sessionId (FK), role, content, toolCalls, createdAt
```
