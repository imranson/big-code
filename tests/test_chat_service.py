"""Unit tests for the streaming chat orchestrator (fake client)."""

from __future__ import annotations

from chatapp.chat_service import stream_chat
from chatapp.conversation import Conversation, Message

from conftest import make_chunk, make_tool_call


def _fake_client(chunks_by_call: list[list]) -> object:
    calls = []

    class FakeClient:
        def __init__(self):
            self._iter = iter(chunks_by_call)

        def chat(self, model=None, messages=None, tools=None, stream=True, think=None, **kwargs):
            calls.append({'model': model, 'messages': messages, 'tools': tools, 'think': think})
            return next(self._iter)

    return FakeClient(), calls


def _consume(generator) -> list[dict]:
    return list(generator)


def test_streams_content_and_thinking():
    client, calls = _fake_client(
        [
            [
                make_chunk(thinking='let me '),
                make_chunk(thinking='think'),
                make_chunk(content='Hello'),
                make_chunk(
                    content=' world',
                    done=True,
                    prompt_eval_count=5,
                    eval_count=3,
                    total_duration=100,
                ),
            ]
        ]
    )
    convo = Conversation.new(model='m', system_prompt='s')
    convo.add_message(Message(role='user', content='hi'))

    events = _consume(
        stream_chat(
            client=client,
            conversation=convo,
            model='m',
            tools=[],
            executors={},
        )
    )

    thinking = ''.join(e['text'] for e in events if e['type'] == 'thinking_delta')
    content = ''.join(e['text'] for e in events if e['type'] == 'content_delta')
    assert thinking == 'let me think'
    assert content == 'Hello world'
    assert events[-1]['type'] == 'done'
    assert events[-1]['stats']['eval_count'] == 3
    assert convo.messages[-1].role == 'assistant'
    assert convo.messages[-1].content == 'Hello world'


def test_tool_call_loop_executes_and_continues():
    client, calls = _fake_client(
        [
            [
                make_chunk(tool_calls=[make_tool_call('web_search', {'query': 'x'})], done=True),
            ],
            [
                make_chunk(content='Found it', done=True, prompt_eval_count=10, eval_count=2),
            ],
        ]
    )
    executed = {}

    def fake_executor(query):
        executed['query'] = query
        return 'results here'

    convo = Conversation.new(model='m', system_prompt='s')
    convo.add_message(Message(role='user', content='search x'))

    events = _consume(
        stream_chat(
            client=client,
            conversation=convo,
            model='m',
            tools=[],
            executors={'web_search': fake_executor},
        )
    )

    types = [e['type'] for e in events]
    assert 'tool_call' in types
    assert 'tool_result' in types
    assert 'done' in types
    assert executed == {'query': 'x'}
    roles = [m.role for m in convo.messages]
    assert roles == ['user', 'assistant', 'tool', 'assistant']
    assert convo.messages[-1].content == 'Found it'
    assert len(calls) == 2


def test_unknown_tool_returns_error():
    client, _ = _fake_client(
        [
            [make_chunk(tool_calls=[make_tool_call('nope', {})], done=True)],
            [make_chunk(content='ok', done=True)],
        ]
    )
    convo = Conversation.new(model='m', system_prompt='s')
    convo.add_message(Message(role='user', content='hi'))
    events = _consume(
        stream_chat(client=client, conversation=convo, model='m', tools=[], executors={})
    )
    result = next(e for e in events if e['type'] == 'tool_result')
    assert "unknown tool 'nope'" in result['content']


def test_executor_exception_is_caught():
    client, _ = _fake_client(
        [
            [make_chunk(tool_calls=[make_tool_call('web_fetch', {'url': 'u'})], done=True)],
            [make_chunk(content='done', done=True)],
        ]
    )

    def boom(url):
        raise RuntimeError('network down')

    convo = Conversation.new(model='m', system_prompt='s')
    convo.add_message(Message(role='user', content='go'))
    events = _consume(
        stream_chat(
            client=client,
            conversation=convo,
            model='m',
            tools=[],
            executors={'web_fetch': boom},
        )
    )
    result = next(e for e in events if e['type'] == 'tool_result')
    assert 'network down' in result['content']


def test_client_exception_yields_error_event():
    class BrokenClient:
        def chat(self, **kwargs):
            raise RuntimeError('boom')

    convo = Conversation.new(model='m', system_prompt='s')
    convo.add_message(Message(role='user', content='hi'))
    events = _consume(
        stream_chat(client=BrokenClient(), conversation=convo, model='m', tools=[], executors={})
    )
    assert events == [{'type': 'error', 'message': 'boom'}]


def test_max_tool_rounds_reached():
    def tool_call_chunk():
        return make_chunk(tool_calls=[make_tool_call('get_current_datetime', {})], done=True)

    class AlwaysToolsClient:
        def chat(self, **kwargs):
            return iter([tool_call_chunk()])

    convo = Conversation.new(model='m', system_prompt='s')
    convo.add_message(Message(role='user', content='hi'))
    events = _consume(
        stream_chat(
            client=AlwaysToolsClient(),
            conversation=convo,
            model='m',
            tools=[],
            executors={'get_current_datetime': lambda: 'now'},
            max_tool_rounds=3,
        )
    )
    assert events[-1]['type'] == 'error'
    assert 'Reached maximum' in events[-1]['message']


def test_duplicate_tool_calls_deduped():
    client, _ = _fake_client(
        [
            [
                make_chunk(tool_calls=[make_tool_call('get_current_datetime', {})]),
                make_chunk(tool_calls=[make_tool_call('get_current_datetime', {})], done=True),
            ],
            [make_chunk(content='done', done=True)],
        ]
    )
    calls = []

    def executor():
        calls.append(1)
        return 'now'

    convo = Conversation.new(model='m', system_prompt='s')
    convo.add_message(Message(role='user', content='hi'))
    _consume(
        stream_chat(
            client=client,
            conversation=convo,
            model='m',
            tools=[],
            executors={'get_current_datetime': executor},
        )
    )
    assert calls == [1]  # executed exactly once despite the duplicate chunk
