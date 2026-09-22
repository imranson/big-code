from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

from chatapp import tools


def test_get_current_datetime_is_iso():
  value = tools.get_current_datetime()
  datetime.fromisoformat(value)  # raises if not ISO-8601


def test_build_tools_returns_schemas_in_stable_order():
  schemas = tools.build_tools({'web_search', 'get_current_datetime'})
  names = [s['function']['name'] for s in schemas]
  assert names == ['web_search', 'get_current_datetime']


def test_build_tools_empty():
  assert tools.build_tools(set()) == []


def test_build_tools_all():
  assert len(tools.build_tools(set(tools.TOOL_NAMES))) == 3


def test_run_web_search():
  result = SimpleNamespace(results=[SimpleNamespace(title='T', url='http://x', content='C')])
  client = SimpleNamespace(web_search=lambda q, max_results=3: result)
  out = tools.run_tool(client, 'web_search', {'query': 'q'})
  assert 'q' in out and 'T' in out and 'http://x' in out


def test_run_web_fetch_requires_url():
  client = SimpleNamespace()
  out = tools.run_tool(client, 'web_fetch', {})
  assert 'requires' in out


def test_run_web_fetch_formats():
  result = SimpleNamespace(title='T', content='C', links=['http://a', 'http://b'])
  client = SimpleNamespace(web_fetch=lambda url: result)
  out = tools.run_tool(client, 'web_fetch', {'url': 'http://x'})
  assert 'T' in out and 'C' in out and 'http://a' in out


def test_run_datetime():
  out = tools.run_tool(SimpleNamespace(), 'get_current_datetime', {})
  datetime.fromisoformat(out)


def test_run_unknown_tool():
  out = tools.run_tool(SimpleNamespace(), 'nope', {})
  assert 'unknown tool' in out


def test_format_caps_length():
  result = SimpleNamespace(
    results=[SimpleNamespace(title='T', url='http://x', content='x' * 20000)]
  )
  out = tools.format_web_search(result, 'q')
  assert len(out) <= tools.MAX_RESULT_CHARS
