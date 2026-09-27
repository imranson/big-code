## Tips For Coders

For Ollama Python library references, see `ollama-python-ref/`.

For Ollama JS library references, see `ollama-js-ref/`.

## exp 5 — Next.js Chat App (current)

A streaming chat UI built with Next.js 16 (App Router) + TypeScript + the Ollama JS SDK, talking to Ollama's **web APIs only** (`OLLAMA_HOST=https://ollama.com` with an API key — no local Ollama server).

Features: streaming chat with token + thinking + tool-call streaming, markdown-rendered assistant replies, a thinking toggle, web tools (`web_search`, `web_fetch`, `get_current_datetime`) executed in a server-side agent loop, conversation history with a new-conversation button, default (editable) system prompts, a rough context-window meter, and archive/unarchive.

### Setup

```bash
npm install
cp .env.local.example .env.local   # then fill in your OLLAMA_API_KEY
```

`.env.local` keys: `OLLAMA_API_KEY`, `OLLAMA_HOST` (keep `https://ollama.com`), `OLLAMA_MODEL`, `OLLAMA_CONTEXT_WINDOW`, `DATA_DIR` (holds `conversations/` and `archive/` JSON files).

### Run

```bash
npm run dev     # dev server on http://localhost:3000
npm run build   # production build
npm start       # serve the production build
```

### Tests

```bash
npm test               # vitest: unit + integration (87 tests)
npm run typecheck      # tsc --noEmit
```

Unit tests cover config, storage, tools, the chat agent loop, token estimation, the system prompt and the NDJSON stream reader. Integration tests cover every API route (conversations, archive, streaming chat) and the full chat UI flow.

### Layout

- `src/app/` — page, layout, and API routes (`/api/chat`, `/api/conversations`, `/api/conversations/[id]`, `/api/conversations/[id]/archive`, `/api/archive`)
- `src/components/` — chat UI (sidebar, composer, messages, markdown, thinking/tool blocks, context meter)
- `src/lib/` — config, Ollama client, tool defs + executor, agent loop (`chat-service.ts`), JSON-file storage, context estimation
- `tests/` — vitest suites (`unit/`, `integration/`)

## Python Setup Only (previous experiment)

Requires Python 3.10+ (the code uses `str | None` union type syntax).

Use the `secret-interface` conda environment:

```bash
conda activate secret-interface
```

## Warnings

Streamlit might silent crash during errors. Rerun script in which case.