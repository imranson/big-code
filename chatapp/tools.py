from __future__ import annotations

from datetime import datetime
from typing import Any, Mapping

MAX_RESULT_CHARS = 8000

TOOL_NAMES = ('web_search', 'web_fetch', 'get_current_datetime')


def get_current_datetime() -> str:
  """Return the current system date and time as an ISO 8601 string."""
  return datetime.now().isoformat(timespec='seconds')


def _tool(name: str, description: str, parameters: dict) -> dict:
  return {
    'type': 'function',
    'function': {
      'name': name,
      'description': description,
      'parameters': parameters,
    },
  }


_TOOL_SCHEMAS = {
  'web_search': _tool(
    'web_search',
    'Search the web for current information and return the top results with titles, URLs, and snippets.',
    {
      'type': 'object',
      'required': ['query'],
      'properties': {
        'query': {'type': 'string', 'description': 'The search query.'},
        'max_results': {'type': 'integer', 'description': 'Maximum number of results (default 3, max 10).'},
      },
    },
  ),
  'web_fetch': _tool(
    'web_fetch',
    'Fetch the content of a single web page and return its title, text content, and links.',
    {
      'type': 'object',
      'required': ['url'],
      'properties': {
        'url': {'type': 'string', 'description': 'The URL of the page to fetch.'},
      },
    },
  ),
  'get_current_datetime': _tool(
    'get_current_datetime',
    'Return the current system date and time (ISO 8601).',
    {'type': 'object', 'properties': {}},
  ),
}


def build_tools(enabled: set[str]) -> list[dict]:
  """Return the tool schemas for the enabled tool names, in a stable order."""
  return [_TOOL_SCHEMAS[name] for name in TOOL_NAMES if name in enabled]


def format_web_search(result: Any, query: str = '') -> str:
  lines = [f'Search results for "{query}":']
  for r in getattr(result, 'results', []) or []:
    title = getattr(r, 'title', None) or getattr(r, 'content', None) or ''
    url = getattr(r, 'url', None) or ''
    content = getattr(r, 'content', None) or ''
    lines.append(str(title))
    if url:
      lines.append(f'   URL: {url}')
    if content:
      lines.append(f'   Content: {content}')
    lines.append('')
  return '\n'.join(lines).rstrip()[:MAX_RESULT_CHARS]


def format_web_fetch(result: Any, url: str = '') -> str:
  lines = [f'Fetch results for "{url}":']
  title = getattr(result, 'title', None) or ''
  content = getattr(result, 'content', None) or ''
  links = getattr(result, 'links', None) or []
  if title:
    lines.append(f'Title: {title}')
  if content:
    lines.append(f'Content: {content}')
  if links:
    lines.append(f'Links: {", ".join(links)}')
  return '\n'.join(lines).rstrip()[:MAX_RESULT_CHARS]


def run_tool(client: Any, name: str, args: Mapping[str, Any]) -> str:
  """Dispatch a tool call to the client and return a formatted string result."""
  args = dict(args or {})
  if name == 'web_search':
    query = str(args.get('query', ''))
    max_results = args.get('max_results', 3)
    result = client.web_search(query, max_results=max_results)
    return format_web_search(result, query)
  if name == 'web_fetch':
    url = str(args.get('url', ''))
    if not url:
      return "Error: web_fetch requires a 'url' argument."
    result = client.web_fetch(url)
    return format_web_fetch(result, url)
  if name == 'get_current_datetime':
    return get_current_datetime()
  return f"Error: unknown tool '{name}'"
