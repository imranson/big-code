"""Optional live tests against Ollama Cloud.

These are skipped by default. Enable them with ``RUN_LIVE_TESTS=1`` and a real
``OLLAMA_API_KEY`` (or a valid ``.streamlit/secrets.toml``).
"""

from __future__ import annotations

import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get('RUN_LIVE_TESTS'),
    reason='set RUN_LIVE_TESTS=1 to run live tests against Ollama Cloud',
)

from chatapp import config  # noqa: E402
from chatapp.ollama_client import create_client  # noqa: E402


def _client():
    assert config.get_api_key(), (
        'OLLAMA_API_KEY is required for live tests; set it in '
        '.streamlit/secrets.toml or the environment'
    )
    return create_client()


def test_live_web_search_returns_results():
    with _client() as client:
        response = client.web_search('ollama python library', max_results=1)
    assert len(response.results) >= 1


def test_live_web_fetch_returns_content():
    with _client() as client:
        response = client.web_fetch('https://example.com')
    assert response.content or response.title


def test_live_chat_smoke():
    model = os.environ.get('LIVE_TEST_MODEL', 'gpt-oss:20b')
    with _client() as client:
        response = client.chat(
            model=model,
            messages=[{'role': 'user', 'content': 'Reply with the single word: hello'}],
            stream=False,
        )
    assert response.message.content
