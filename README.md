# Ollama Cloud Chat

A Streamlit chat app backed by the **Ollama cloud API** (`https://ollama.com`) — no local Ollama server required. Uses the official [Ollama Python SDK](https://github.com/ollama/ollama-python) (reference copy in `ollama-python-ref/`).

## Features

- Working chat against Ollama's cloud models (web API only, not `localhost:11434`)
- Thinking mode toggle (`think=True`)
- Conversation history, persisted as JSON files
- Configurable system prompt
- Built-in tools: web search, web fetch, and system date/time
- Rough context-window usage indicator
- Archive / restore conversations

## Setup

Requires Python 3.10+ and the `secret-interface` conda environment:

```bash
conda activate secret-interface
pip install -r requirements.txt
```

Add your Ollama API key to `.streamlit/secrets.toml` (get one at https://ollama.com/settings/keys):

```toml
OLLAMA_API_KEY = "your-key-here"
# OLLAMA_HOST = "https://ollama.com"   # optional, this is the default
```

## Run

```bash
streamlit run app.py
```

Conversations are stored under `data/conversations/` (active) and `data/archive/` (archived).

## Tests

```bash
# Unit tests (no network)
pytest -m "not integration"

# Live integration tests against the Ollama cloud API (skipped without OLLAMA_API_KEY)
pytest -m integration
```

## Warnings

Streamlit may silently crash on errors; rerun the script in that case.
