# Features

## Chat & AI

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-turn streaming chat | ✅ | AI SDK v6 `useChat` + `DefaultChatTransport` |
| Multi-provider support | ✅ | Gemini, OpenAI, OpenAI-compatible (custom baseURL + modelId) |
| Tool calling | ✅ | `updateSection`, `scoreATS`, `matchJob`, `validateResume` |
| Tool approval flow | ✅ | `needsApproval: true`; manual card or auto-approve toggle |
| Error toasts | ✅ | `onError` → `toast.error()`; API errors return JSON |
| Voice input | ✅ | Web Speech API; real-time speech-to-text; Chrome/Safari only |

## Resume Editor

| Feature | Status | Notes |
|---------|--------|-------|
| Live preview | ✅ | Renders JSON Resume sections |
| JSON view | ✅ | Raw formatted JSON |
| Field-level diff | ✅ | Recursive object walk; added/removed/changed labels |
| Change history | ✅ | Timestamped log, source badge (AI/manual) |
| Undo/redo | ✅ | Full history stack in `useResume` |
| Editor toolbar | ✅ | Undo/redo buttons + auto-approve toggle |

## Session Management

| Feature | Status | Notes |
|---------|--------|-------|
| Create/list/delete sessions | ✅ | Persisted to SQLite/D1 |
| Resume upload | ✅ | `.json`, `.md`, `.txt`; max 5MB |
| Resume export | ✅ | HTML, JSON, plain text |
| Job description storage | ✅ | Stored per session as `jdText` |

## Settings

| Feature | Status | Notes |
|---------|--------|-------|
| API key storage | ✅ | localStorage only, never sent to server except in request body |
| Provider selection | ✅ | Gemini / OpenAI / custom |
| Custom base URL + model ID | ✅ | For OpenAI-compatible providers |
