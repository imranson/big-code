# Test suite

Vitest + React Testing Library. Run with `npm test` (or `npm run test:unit`,
`npm run test:integration`, `npm run test:components`).

The suite is test-first: it encodes the intended behavior of the exp-4 app and
imports modules that are not implemented yet (they resolve via the `@/` alias,
mapped to the repo root in `vitest.config.ts`). Implement the contracts below to
turn the suite green.

## Module contract

| Module | Exports |
| --- | --- |
| `lib/config.ts` | `DEFAULT_MODEL` (`"gpt-oss:120b"`), `resolveConfig()` → `{ model, contextWindow, host }` |
| `lib/store.ts` | `ConversationStore` (ctor takes optional `baseDir`), `getStore()`, `deriveTitle(messages)` |
| `lib/tools.ts` | `getTools()` (3 function tools), `executeTool(name, args, client, now?)` |
| `lib/system-prompt.ts` | `buildSystemPrompt({ model, tools, template? })` |
| `lib/chat.ts` | `streamChat({ client, model, messages, system, think?, tools, maxIterations?, now? })` |
| `lib/context.ts` | `estimateTokens(text)`, `estimateContext({ messages, systemPrompt?, contextWindow })` |
| `lib/ollama.ts` | `getOllamaClient()` — constructs the SDK client from `OLLAMA_HOST` / `OLLAMA_API_KEY` |

API route handlers (App Router `route.ts`, all runtime `nodejs`):

- `app/api/config/route.ts` — `GET` → `{ model, contextWindow, host }`
- `app/api/conversations/route.ts` — `GET` (`?archived=true` for archived), `POST`
- `app/api/conversations/[id]/route.ts` — `GET`, `PATCH`, `DELETE`
- `app/api/conversations/[id]/archive/route.ts` — `POST`
- `app/api/conversations/[id]/unarchive/route.ts` — `POST`
- `app/api/chat/route.ts` — `POST`, streams newline-delimited JSON of
  `{ type: "token"|"thinking"|"tool_call"|"tool_result"|"done"|"error", ... }`

`app/page.tsx` default-exports the client chat page (see the UI contract header
in `tests/components/chat-page.test.tsx`).

## Conversation model

A conversation is `{ id, title, model, system_prompt, created_at, updated_at,
messages }`. `id` is a UUID with dashes stripped (32 hex chars). List endpoints
return summaries `{ id, title, model, created_at, updated_at }` (no `messages`),
sorted by `updated_at` descending.

## Context estimate

`estimateTokens(text) = max(0, ceil(text.length / 4))` (roughly 4 chars per
token). `estimateContext` sums tokens over `systemPrompt` plus each message's
`content` and `thinking`, then returns `{ used, total, ratio, percent }` with
`ratio` clamped to `[0, 1]` and `percent = round(ratio * 100)`.
