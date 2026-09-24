# Assistant — Ollama web chat (Next.js)

A chat app built with **Next.js (App Router) + TypeScript + the Ollama JS SDK**. It talks to
Ollama's **cloud API only** (`https://ollama.com`) — no local Ollama server is required.

For Ollama JS library reference source, see `ollama-js-ref/`. (Python references live in
`ollama-python-ref/`.)

## Features

- Working chat, streaming via the app's own API route (web APIs only, API key kept server-side).
- Thinking option exposed to the user (off / auto / low / medium / high).
- Token and tool-call streaming over NDJSON.
- Conversation history with a "New conversation" button.
- Default parameterized system prompt (model name + available tools filled in).
- Ollama web tools: `web_search`, `web_fetch`, plus a `get_current_datetime` system tool.
- Rough context-window usage estimate (characters/4, shown as a percentage bar).
- Archive / unarchive / delete conversation buttons — archived conversations move to `archive/`.
- Unit and integration tests for every feature (Vitest).

## Setup

```bash
npm install
cp .env.example .env.local      # then fill in OLLAMA_API_KEY
```

Create an API key at https://ollama.com/settings/keys and put it in `.env.local`:

```env
OLLAMA_API_KEY=your-key
```

## Run

```bash
npm run dev        # development server
npm run build      # production build
npm start          # run the production build
npm run typecheck  # TypeScript check
npm test           # Vitest (unit + integration)
```

## How it works

- `app/api/chat/route.ts` — streams the chat turn, runs the tool loop, and persists the
  conversation.
- `app/api/conversations/**` — list / create / fetch / patch / delete / archive / unarchive.
- `lib/agent.ts` — the chat + tool-loop generator (yields thinking, tokens, tool calls, results).
- `lib/conversations.ts` — file-based store: conversations live in `data/conversations/` and are
  moved to `data/archive/` on archive.
- `lib/tools.ts`, `lib/systemPrompt.ts`, `lib/context.ts` — tools, prompt, and context estimate.

Conversation data is stored as JSON files under `data/` (gitignored).
