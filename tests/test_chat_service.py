from __future__ import annotations

from types import SimpleNamespace

from conftest import FakeOllamaClient

from chatapp.chat_service import ChatService


def _tool_call(name='web_search', args=None):
  return {'function': {'name': name, 'arguments': args or {'query': 'hello'}}}


def _search_result():
  return SimpleNamespace(results=[SimpleNamespace(title='T', url='u', content='c')])


def test_simple_chat_no_tools():
  fake = FakeOllamaClient([{'role': 'assistant', 'content': 'hi there'}])
  result = ChatService(fake).run(model='m', user_input='hello')
  assert result.content == 'hi there'
  assert result.tool_calls_made == []
  assert result.messages == [
    {'role': 'user', 'content': 'hello'},
    {'role': 'assistant', 'content': 'hi there'},
  ]


def test_tool_call_loop():
  fake = FakeOllamaClient([
    {'role': 'assistant', 'tool_calls': [_tool_call()]},
    {'role': 'assistant', 'content': 'final answer'},
  ])
  fake.web_search_results = _search_result()
  result = ChatService(fake).run(
    model='m', user_input='search please', enabled_tools={'web_search'}
  )
  assert result.content == 'final answer'
  assert [t['name'] for t in result.tool_calls_made] == ['web_search']
  assert [m['role'] for m in result.messages] == ['user', 'assistant', 'tool', 'assistant']


def test_system_prompt_sent_and_stripped():
  fake = FakeOllamaClient([{'role': 'assistant', 'content': 'ok'}])
  result = ChatService(fake).run(model='m', user_input='hi', system_prompt='be nice')
  sent = fake.chat_calls[0]['messages']
  assert sent[0] == {'role': 'system', 'content': 'be nice'}
  assert all(m.get('role') != 'system' for m in result.messages)


def test_thinking_is_captured_and_forwarded():
  fake = FakeOllamaClient([{'role': 'assistant', 'content': 'answer', 'thinking': 'hmm'}])
  result = ChatService(fake).run(model='m', user_input='hi', think=True)
  assert result.thinking == 'hmm'
  assert fake.chat_calls[0]['think'] is True


def test_history_is_forwarded():
  fake = FakeOllamaClient([{'role': 'assistant', 'content': 'ok'}])
  history = [{'role': 'user', 'content': 'earlier'}, {'role': 'assistant', 'content': 'resp'}]
  ChatService(fake).run(model='m', user_input='now', history=history)
  sent = fake.chat_calls[0]['messages']
  assert history[0] in sent and history[1] in sent


def test_max_iterations_stops():
  fake = FakeOllamaClient([{'role': 'assistant', 'tool_calls': [_tool_call()]}] * 20)
  fake.web_search_results = SimpleNamespace(results=[])
  result = ChatService(fake, max_iterations=3).run(
    model='m', user_input='hi', enabled_tools={'web_search'}
  )
  assert len(result.tool_calls_made) == 3
  assert 'maximum tool iterations' in result.content
