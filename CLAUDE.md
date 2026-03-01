# CLAUDE.md

## Docs

See [docs/README.md](./docs/README.md) for the table of contents. Keep docs in sync after code changes.

## Gotchas

- No test framework configured
- No env vars needed for dev — API keys stored client-side in localStorage
- Local dev uses better-sqlite3 (`local.db` auto-created), production uses Cloudflare D1
- Add shadcn/ui components via `pnpm dlx shadcn@latest add <component>` (new-york style)

## AI SDK v6 (breaking changes from v5)

Uses `@ai-sdk/react` (not `ai/react`):
- `useChat()` with `DefaultChatTransport` for custom API endpoint
- `sendMessage()` not `append()`
- `toolCall.input` not `toolCall.args`
- `stopWhen: stepCountIs(5)` not `maxSteps`
- `toUIMessageStreamResponse()` not `toDataStreamResponse()`
- OpenAI-compatible APIs must use `.chat()` (default `()` uses Responses API)

## Deployment

Cloudflare Pages with D1 + R2 bindings. Config in `wrangler.toml`.

```bash
pnpm build && npx @cloudflare/next-on-pages && wrangler pages deploy .vercel/output/static
```
