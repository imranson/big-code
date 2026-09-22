from __future__ import annotations

from conftest import FakeOllamaClient

from chatapp.ollama_client import OllamaClient, build_headers


def test_build_headers_with_key():
  assert build_headers('k') == {'Authorization': 'Bearer k'}


def test_build_headers_without_key():
  assert build_headers('') is None
  assert build_headers(None) is None


def test_chat_delegates_to_client():
  fake = FakeOllamaClient([{'role': 'assistant', 'content': 'hi'}])
  client = OllamaClient('https://ollama.com', 'k', client=fake)
  response = client.chat(
    'm', [{'role': 'user', 'content': 'hello'}], think=True, options={'num_ctx': 4096}
  )
  assert response.message['content'] == 'hi'
  call = fake.chat_calls[0]
  assert call['model'] == 'm'
  assert call['think'] is True
  assert call['options'] == {'num_ctx': 4096}


def test_web_search_and_fetch_delegate():
  fake = FakeOllamaClient()
  client = OllamaClient('https://ollama.com', 'k', client=fake)
  client.web_search('q', max_results=5)
  assert fake.web_searches == [('q', 5)]
  client.web_fetch('http://x')
  assert fake.web_fetches == ['http://x']
