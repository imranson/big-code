from __future__ import annotations

import os

import pytest

from chatapp.ollama_client import OllamaClient


@pytest.mark.integration
def test_web_search_live(live_config):
  client = OllamaClient(live_config['host'], live_config['api_key'])
  result = client.web_search('Ollama', max_results=2)
  assert len(result.results) >= 1


@pytest.mark.integration
def test_web_fetch_live(live_config):
  client = OllamaClient(live_config['host'], live_config['api_key'])
  result = client.web_fetch('https://ollama.com')
  assert result.title or result.content


@pytest.mark.integration
def test_chat_live(live_config):
  model = os.getenv('OLLAMA_TEST_MODEL', 'gpt-oss:120b-cloud')
  client = OllamaClient(live_config['host'], live_config['api_key'])
  result = client.chat(model, [{'role': 'user', 'content': 'Reply with the single word: ok'}])
  assert result.message.content
