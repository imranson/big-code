from __future__ import annotations

import os
import tomllib
from pathlib import Path
from typing import Any, Sequence

import pytest

from chatapp.conversation import Conversation
from chatapp.storage import Storage

REPO_ROOT = Path(__file__).resolve().parents[1]


class FakeResponse:
  def __init__(self, message: dict):
    self.message = message


class FakeOllamaClient:
  """Scriptable stand-in for OllamaClient with .chat/.web_search/.web_fetch."""

  def __init__(self, chat_responses: Sequence[dict] | None = None):
    self.chat_responses = list(chat_responses or [])
    self.chat_calls: list[dict] = []
    self.web_searches: list[tuple] = []
    self.web_fetches: list[str] = []
    self.web_search_results: Any = None
    self.web_fetch_result: Any = None

  def chat(self, model, messages, *, tools=None, think=None, options=None):
    self.chat_calls.append({
      'model': model,
      'messages': list(messages),
      'tools': tools,
      'think': think,
      'options': options,
    })
    if not self.chat_responses:
      return FakeResponse({'role': 'assistant', 'content': ''})
    return FakeResponse(self.chat_responses.pop(0))

  def web_search(self, query, max_results=3):
    self.web_searches.append((query, max_results))
    return self.web_search_results

  def web_fetch(self, url):
    self.web_fetches.append(url)
    return self.web_fetch_result


@pytest.fixture
def storage(tmp_path: Path) -> Storage:
  return Storage(tmp_path / 'data')


@pytest.fixture
def conversation() -> Conversation:
  return Conversation.new(model='test-model')


def load_api_key() -> str:
  key = os.getenv('OLLAMA_API_KEY', '')
  if key:
    return key
  secrets = REPO_ROOT / '.streamlit' / 'secrets.toml'
  if secrets.exists():
    try:
      data = tomllib.loads(secrets.read_text(encoding='utf-8'))
      key = data.get('OLLAMA_API_KEY', '')
    except (tomllib.TOMLDecodeError, OSError):
      key = ''
  return key


@pytest.fixture(scope='session')
def live_config() -> dict:
  key = load_api_key()
  if not key:
    pytest.skip('OLLAMA_API_KEY not set')
  host = os.getenv('OLLAMA_HOST', 'https://ollama.com')
  return {'api_key': key, 'host': host}
