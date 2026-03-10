# Logging & Observability

## Structured Logger

`src/lib/logger.ts` — zero-dependency structured JSON logger, edge-compatible.

### Usage

```ts
import { createLogger, getRequestId } from "@/lib/logger"

const log = createLogger({
  route: "/api/resumes",
  requestId: getRequestId(req.headers),
})

log.info("Creating resume", { sessionId })
log.error("Failed to create resume", error)
const db = await log.time("db.connect", () => createDb())
```

### Log Levels

`debug | info | warn | error` — controlled by `LOG_LEVEL` env var.

- Default in dev: `debug`
- Default in prod: `info`

### Output Format

Single-line JSON per log entry:

```json
{"level":"info","msg":"db.connect completed","ts":"2026-03-09T...","route":"/api/resumes","requestId":"abc-123","durationMs":12}
```

## Correlation IDs

Every API request gets a unique `x-request-id`:

1. `src/middleware.ts` stamps the header on all `/api/*` responses
2. Route handlers read it via `getRequestId(req.headers)`
3. All log entries from that request share the same `requestId`

## Error Boundaries

- `src/app/error.tsx` — root error boundary
- `src/app/(app)/error.tsx` — app layout error boundary

Both log the error via `console.error` and show a retry button.

## Reading Logs

### Local Dev

Structured JSON prints directly to the terminal running `pnpm dev`.

### Production (Cloudflare)

```bash
# Stream live logs
wrangler pages deployment tail --format json

# Filter by level
wrangler pages deployment tail --format json | jq 'select(.level == "error")'

# Filter by request ID
wrangler pages deployment tail --format json | jq 'select(.requestId == "abc-123")'
```

## Files

| File | Purpose |
|------|---------|
| `src/lib/logger.ts` | Structured logger factory |
| `src/middleware.ts` | Request tracing middleware |
| `src/app/error.tsx` | Root error boundary |
| `src/app/(app)/error.tsx` | App error boundary |
