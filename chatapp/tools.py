"""Tool schemas and executors exposed to the model.

Three tools are wired up: Ollama's hosted ``web_search`` and ``web_fetch``, plus
a local ``get_current_datetime`` that returns the system clock.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

MAX_TOOL_CONTENT_CHARS = 8_000

WEB_SEARCH_SCHEMA: dict[str, Any] = {
    'type': 'function',
    'function': {
        'name': 'web_search',
        'description': (
            'Search the web for up-to-date information using Ollama\'s hosted '
            'search. Use this when you need current facts, news, or anything '
            'beyond your knowledge cutoff.'
        ),
        'parameters': {
            'type': 'object',
            'properties': {
                'query': {'type': 'string', 'description': 'The search query.'},
                'max_results': {
                    'type': 'integer',
                    'description': 'Maximum number of results (1-10).',
                },
            },
            'required': ['query'],
        },
    },
}

WEB_FETCH_SCHEMA: dict[str, Any] = {
    'type': 'function',
    'function': {
        'name': 'web_fetch',
        'description': 'Fetch and extract the text content of a web page given its URL.',
        'parameters': {
            'type': 'object',
            'properties': {
                'url': {'type': 'string', 'description': 'The absolute URL of the page to fetch.'},
            },
            'required': ['url'],
        },
    },
}

GET_DATETIME_SCHEMA: dict[str, Any] = {
    'type': 'function',
    'function': {
        'name': 'get_current_datetime',
        'description': 'Get the current system date and time.',
        'parameters': {'type': 'object', 'properties': {}, 'required': []},
    },
}


def build_tool_schemas() -> list[dict[str, Any]]:
    return [WEB_SEARCH_SCHEMA, WEB_FETCH_SCHEMA, GET_DATETIME_SCHEMA]


def cap_tool_content(text: str, limit: int = MAX_TOOL_CONTENT_CHARS) -> str:
    if not text:
        return text
    if len(text) <= limit:
        return text
    if limit <= 1:
        return text[:limit]
    return text[: limit - 1] + '…'


def format_web_search_results(query: str, response: Any) -> str:
    lines = [f'Search results for "{query}":']
    for result in response.results:
        title = getattr(result, 'title', '') or ''
        url = getattr(result, 'url', '') or ''
        content = getattr(result, 'content', '') or ''
        lines.append(f'- {title} ({url})' if title else f'- {url}')
        if content:
            lines.append(f'  {content}')
    return '\n'.join(lines)


def format_web_fetch_results(url: str, response: Any) -> str:
    lines = [f'Fetched {url}']
    if getattr(response, 'title', None):
        lines.append(f'Title: {response.title}')
    if getattr(response, 'content', None):
        lines.append(response.content)
    if getattr(response, 'links', None):
        lines.append('Links: ' + ', '.join(response.links))
    return '\n'.join(lines)


def make_executors(
    client: Any,
    now_fn: Callable[[], datetime] | None = None,
) -> dict[str, Callable[..., str]]:
    """Return ``{tool_name: executor}`` bound to the given client."""
    now_fn = now_fn or datetime.now

    def do_web_search(query: str, max_results: int = 3) -> str:
        response = client.web_search(query=query, max_results=max_results)
        return cap_tool_content(format_web_search_results(query, response))

    def do_web_fetch(url: str) -> str:
        response = client.web_fetch(url=url)
        return cap_tool_content(format_web_fetch_results(url, response))

    def do_get_current_datetime() -> str:
        return now_fn().isoformat()

    return {
        'web_search': do_web_search,
        'web_fetch': do_web_fetch,
        'get_current_datetime': do_get_current_datetime,
    }
