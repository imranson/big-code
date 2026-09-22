"""Integration tests: real ollama.Client + httpx.MockTransport (no network).

These exercise the real HTTP serialization/deserialization path (SDK request
models, NDJSON streaming parse, web_search/web_fetch response parsing) together
with our orchestration and executors.
"""

from __future__ import annotations

import json

import httpx

from chatapp.chat_service import stream_chat
from chatapp.conversation import Conversation, Message
from chatapp.ollama_client import create_client
from chatapp.tools import build_tool_schemas, make_executors


def _ndjson(chunks: list[dict]) -> bytes:
    return '\n'.join(json.dumps(c) for c in chunks).encode()


def _chat_response(status: int, chunks: list[dict]) -> httpx.Response:
    return httpx.Response(
        status,
        content=_ndjson(chunks),
        headers={'content-type': 'application/x-ndjson'},
    )


def _make_handler() -> tuple:
    """Return (handler, requests) simulating the Ollama Cloud API."""
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        path = request.url.path

        if path == '/api/chat':
            body = json.loads(request.content)
            last = body['messages'][-1]
            if last.get('role') == 'tool':
                chunks = [
                    {'model': 'm', 'message': {'role': 'assistant', 'content': 'Answer: '}, 'done': False},
                    {'model': 'm', 'message': {'role': 'assistant', 'content': 'done.'}, 'done': False},
                    {
                        'model': 'm',
                        'message': {'role': 'assistant', 'content': ''},
                        'done': True,
                        'prompt_eval_count': 21,
                        'eval_count': 4,
                        'total_duration': 500,
                        'done_reason': 'stop',
                    },
                ]
            else:
                chunks = [
                    {
                        'model': 'm',
                        'message': {
                            'role': 'assistant',
                            'tool_calls': [
                                {'function': {'name': 'web_search', 'arguments': {'query': 'ollama'}}}
                            ],
                        },
                        'done': False,
                    },
                    {'model': 'm', 'message': {'role': 'assistant', 'content': ''}, 'done': True, 'done_reason': 'tool_calls'},
                ]
            return _chat_response(200, chunks)

        if path == '/api/web_search':
            return httpx.Response(
                200,
                json={
                    'results': [
                        {'title': 'Ollama', 'url': 'https://ollama.com', 'content': 'Run LLMs locally.'}
                    ]
                },
            )

        if path == '/api/web_fetch':
            return httpx.Response(
                200,
                json={'title': 'Page', 'content': 'Fetched body', 'links': ['https://a']},
            )

        return httpx.Response(404)

    return handler, requests


def test_web_search_roundtrip_through_real_client(fake_api_key):
    handler, requests = _make_handler()
    client = create_client(
        host='https://ollama.com',
        api_key=fake_api_key,
        transport=httpx.MockTransport(handler),
    )
    try:
        resp = client.web_search('ollama', max_results=3)
        assert [r.title for r in resp.results] == ['Ollama']
        assert resp.results[0].url == 'https://ollama.com'
    finally:
        client.close()

    assert requests[0].url.path == '/api/web_search'
    assert requests[0].headers['authorization'] == f'Bearer {fake_api_key}'


def test_web_fetch_roundtrip_through_real_client(fake_api_key):
    handler, _ = _make_handler()
    client = create_client(
        host='https://ollama.com',
        api_key=fake_api_key,
        transport=httpx.MockTransport(handler),
    )
    try:
        resp = client.web_fetch('https://example.com')
        assert resp.title == 'Page'
        assert resp.content == 'Fetched body'
    finally:
        client.close()


def test_full_tool_loop_end_to_end(fake_api_key):
    handler, requests = _make_handler()
    client = create_client(
        host='https://ollama.com',
        api_key=fake_api_key,
        transport=httpx.MockTransport(handler),
    )
    convo = Conversation.new(model='m', system_prompt='s')
    convo.add_message(Message(role='user', content='search for ollama'))

    tools = build_tool_schemas()
    executors = make_executors(client)

    try:
        events = list(
            stream_chat(
                client=client,
                conversation=convo,
                model='m',
                tools=tools,
                executors=executors,
                think=True,
            )
        )
    finally:
        client.close()

    types = [e['type'] for e in events]
    assert 'tool_call' in types
    assert 'tool_result' in types
    assert 'done' in types

    content = ''.join(e['text'] for e in events if e['type'] == 'content_delta')
    assert content == 'Answer: done.'

    tool_result = next(e for e in events if e['type'] == 'tool_result')
    assert 'Ollama' in tool_result['content']

    done = next(e for e in events if e['type'] == 'done')
    assert done['stats']['prompt_eval_count'] == 21
    assert done['stats']['eval_count'] == 4

    # Two chat calls: tool round, then final answer round.
    chat_requests = [r for r in requests if r.url.path == '/api/chat']
    assert len(chat_requests) == 2
    # The tool round request should carry our tool schemas and the think flag.
    assert chat_requests[0].content is not None
    first_body = json.loads(chat_requests[0].content)
    assert first_body['think'] is True
    assert [t['function']['name'] for t in first_body['tools']] == [
        'web_search',
        'web_fetch',
        'get_current_datetime',
    ]
