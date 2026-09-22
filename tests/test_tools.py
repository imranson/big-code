"""Unit tests for tool schemas and executors."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

from chatapp.tools import (
    build_tool_schemas,
    cap_tool_content,
    make_executors,
)


def test_schemas_include_all_three_tools():
    names = {t['function']['name'] for t in build_tool_schemas()}
    assert names == {'web_search', 'web_fetch', 'get_current_datetime'}


def test_executors_have_matching_names():
    names = set(make_executors(client=SimpleNamespace()).keys())
    assert names == {'web_search', 'web_fetch', 'get_current_datetime'}


def test_web_search_executor_formats_results():
    class FakeClient:
        def web_search(self, query, max_results=3):
            assert query == 'ollama'
            assert max_results == 2
            return SimpleNamespace(
                results=[
                    SimpleNamespace(title='T1', url='https://a', content='body'),
                    SimpleNamespace(title=None, url='https://b', content=None),
                ]
            )

    executors = make_executors(client=FakeClient())
    out = executors['web_search'](query='ollama', max_results=2)
    assert 'T1' in out
    assert 'https://a' in out
    assert 'body' in out


def test_web_fetch_executor_formats_results():
    class FakeClient:
        def web_fetch(self, url):
            return SimpleNamespace(title='Page', content='hello world', links=['https://x'])

    executors = make_executors(client=FakeClient())
    out = executors['web_fetch'](url='https://example.com')
    assert 'Page' in out
    assert 'hello world' in out
    assert 'https://x' in out


def test_get_current_datetime_uses_injected_clock():
    fixed = datetime(2026, 9, 22, 12, 0, 0)
    executors = make_executors(client=SimpleNamespace(), now_fn=lambda: fixed)
    assert executors['get_current_datetime']() == fixed.isoformat()


def test_cap_tool_content_truncates_long_text():
    long_text = 'x' * 100
    out = cap_tool_content(long_text, limit=20)
    assert len(out) <= 20
    assert out.endswith('…')


def test_cap_tool_content_keeps_short_text():
    assert cap_tool_content('short', limit=20) == 'short'
