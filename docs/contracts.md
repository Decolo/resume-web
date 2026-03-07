# Contracts

## API Routes

All non-static routes under `src/app/api/**/route.ts` are expected to run on Edge Runtime:
```typescript
export const runtime = "edge"
```

### POST /api/chat

Streams AI responses with tool calling.

**Request body:**
```typescript
{
  messages: UIMessage[]           // AI SDK UIMessage[]
  provider: "gemini" | "openai"
  apiKey: string                  // required
  baseURL?: string                // OpenAI-compatible endpoint
  modelId?: string                // override default model
  resume: Record<string, unknown> // current resume state
}
```

**Response:** `UIMessageStreamResponse` (streaming). On error: `{ error: string }` with 4xx/5xx status.

---

### GET /api/sessions

**Response:** `Session[]`

### POST /api/sessions

**Request:** `{ provider?: "gemini" | "openai" }`

**Response:** `Session`

### GET /api/sessions/[id]

**Response:** `Session`

### PATCH /api/sessions/[id]

**Request:**
```typescript
{
  resumeJson?: string
  jdText?: string
  workflowState?: string
  provider?: "openai" | "gemini"
}
```

**Response:** Updated `Session`

### DELETE /api/sessions/[id]

**Response:** 204 No Content

---

### GET /api/sessions/[id]/messages

Returns persisted UI chat snapshot for a session.

**Response:** `UIMessage[]` (empty array when no snapshot or malformed legacy snapshot)

### PUT /api/sessions/[id]/messages

Persists full UI chat snapshot for a session (upsert semantics).

**Request:** `UIMessage[]`

**Response:** `{ ok: true }`

---

### POST /api/files

**Request:** `FormData` — fields: `sessionId: string`, `file: File` (`.json`/`.md`/`.txt`, max 5MB)

**Response:**
```typescript
{ filename: string; sessionId: string; resume: Resume; resumeJson: Record<string, unknown> }
```

---

### GET /api/sessions/[id]/resumes

**Response:** `Resume[]` (0..N resumes for a session)

### POST /api/resumes

**Request:** `{ sessionId: string; title: string; content: string }`

**Response:** `Resume` (201)

### PUT /api/resumes/[id]

**Request:** `{ title?: string; content?: string }`

**Response:** Updated `Resume`

### DELETE /api/resumes/[id]

**Response:** 204 No Content

---

### POST /api/export

**Request:** `{ content: string; format: "html" | "json" | "text" }`

**Response:** File download with `Content-Disposition` header.

---

## Data Shapes

### Session
```typescript
{
  id: string
  resumeJson: string | null   // legacy, use resumes table instead
  jdText: string | null
  workflowState: string       // default: "draft"
  provider: string
  createdAt: Date
  updatedAt: Date
}
```

### Resume
```typescript
{
  id: string
  sessionId: string           // FK to sessions (many resumes per session)
  title: string
  content: string             // stringified JsonResume
  createdAt: Date
  updatedAt: Date
}
```

### JsonResume (subset)
```typescript
{
  basics?: { name?, label?, email?, phone?, url?, summary?, location? }
  work?: Array<{ name?, position?, startDate?, endDate?, summary?, highlights? }>
  education?: Array<{ institution?, area?, studyType?, startDate?, endDate? }>
  skills?: Array<{ name?, keywords? }>
  projects?: Array<{ name?, description?, url?, highlights? }>
}
```

### ChangeEntry
```typescript
{
  id: string
  path: string          // dot-notation path e.g. "basics.name"
  oldValue: unknown
  newValue: unknown
  timestamp: number     // Date.now()
  toolCallId?: string
  source: "ai" | "manual"
}
```

---

## Tool Schemas

### updateSection *(requires approval)*
```typescript
input:  { path: string; value: unknown }
output: { success: boolean; path: string; updatedValue: unknown; error?: string }
```

### scoreATS
```typescript
input:  { content: string; jobDescription?: string }
output: {
  overallScore: number   // 0–100
  formatting: number
  completeness: number
  keywords: number
  structure: number
  suggestions: string[]
  report: string
}
```

### matchJob
```typescript
input:  { resumeContent: string; jobDescription: string }
output: {
  matchScore: number     // 0–100
  matchedKeywords: string[]
  missingKeywords: string[]
  suggestions: Array<{ section: string; action: string; detail: string }>
  report: string
}
```

### validateResume
```typescript
input:  { content: string; fileFormat?: ".md" | ".txt" | ".html" | ".json" }
output: {
  valid: boolean
  errors: Array<{ level: "error"; check: string; message: string }>
  warnings: Array<{ level: "warning"; check: string; message: string }>
  report: string
}
```
