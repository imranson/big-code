"""Configuration and defaults for the chat application.

This module is deliberately free of any Streamlit import so that it can be
unit-tested without a running app. Settings resolve with this precedence:

1. environment variables (highest)
2. the Streamlit secrets TOML file (``.streamlit/secrets.toml``, or the path in
   ``CHATAPP_SECRETS_FILE``)
3. built-in defaults (lowest)
"""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

DEFAULT_HOST = 'https://ollama.com'
DEFAULT_MODEL = 'gpt-oss:120b-cloud'
DEFAULT_CONTEXT_WINDOW = 131_072  # ~128k tokens, a common cloud default.

DEFAULT_SYSTEM_PROMPT = (
    'You are {assistant_name}, a helpful, accurate and concise assistant.\n'
    "Today's date is {current_date} and the current local time is {current_time}.\n"
    "You are powered by the model '{model}'.\n"
    'You have access to tools: use web_search to look up current or recent '
    'information, web_fetch to read the contents of a specific web page, and '
    'get_current_datetime to obtain the precise current date and time. Prefer '
    'these tools over guessing whenever timeliness or accuracy matters.'
)


class _SafeDict(dict):
    """A dict that returns the unresolved placeholder instead of raising.

    This lets users keep literal ``{braces}`` in a system prompt without
    crashing ``str.format_map``.
    """

    def __missing__(self, key: str) -> str:
        return '{' + key + '}'


def render_system_prompt(
    template: str = DEFAULT_SYSTEM_PROMPT,
    *,
    model: str = DEFAULT_MODEL,
    assistant_name: str = 'Assistant',
    now: datetime | None = None,
) -> str:
    """Fill the parameterised system-prompt template with concrete values."""
    now = now or datetime.now()
    return template.format_map(
        _SafeDict(
            assistant_name=assistant_name,
            current_date=now.strftime('%Y-%m-%d'),
            current_time=now.strftime('%H:%M:%S'),
            model=model,
        )
    )


def _secrets_file() -> Path:
    override = os.environ.get('CHATAPP_SECRETS_FILE')
    if override:
        return Path(override)
    return Path(__file__).resolve().parent.parent / '.streamlit' / 'secrets.toml'


def load_secrets() -> dict[str, str]:
    """Best-effort read of the Streamlit secrets TOML file.

    Only scalar values are returned (Streamlit secrets are flat key/value
    pairs). Any error or missing file yields an empty dict.
    """
    path = _secrets_file()
    if not path.exists():
        return {}

    try:
        import tomllib  # Python 3.11+
    except ImportError:  # pragma: no cover - Python 3.10 fallback
        try:
            import tomli as tomllib  # type: ignore[no-redef]
        except ImportError:
            return {}

    try:
        with open(path, 'rb') as f:
            data = tomllib.load(f)
    except Exception:  # noqa: BLE001 - secrets are optional
        return {}

    return {k: str(v) for k, v in data.items() if isinstance(v, (str, int, float, bool))}


def _setting(key: str) -> str | None:
    value = os.environ.get(key)
    if value:
        return value
    return load_secrets().get(key) or None


def get_api_key() -> str | None:
    return _setting('OLLAMA_API_KEY')


def get_host() -> str:
    return _setting('OLLAMA_HOST') or DEFAULT_HOST


def get_data_dir() -> str:
    return os.environ.get('CHATAPP_DATA_DIR') or os.path.join(os.getcwd(), 'data')
