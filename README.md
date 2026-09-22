## Tips For Coders

For Ollama Python library references, see `ollama-python-ref/`.

## Setup

Requires Python 3.10+ (the code uses `str | None` union type syntax).

Use the `secret-interface` conda environment:

```bash
conda activate secret-interface
```

## Run

```bash
conda activate secret-interface
streamlit run app.py
```

Set `OLLAMA_API_KEY` in `.streamlit/secrets.toml` (or the environment) to use the
hosted Ollama API, web search and web fetch.

## Test

```bash
python -m pytest tests/
```

Live tests against Ollama Cloud are opt-in: `RUN_LIVE_TESTS=1 python -m pytest tests/test_cloud_live.py`.

## Warnings

Streamlit might silent crash during errors. Rerun script in which case.
