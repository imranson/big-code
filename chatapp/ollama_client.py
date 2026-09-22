"""Thin factory around :class:`ollama.Client` pointed at Ollama's hosted API."""

from __future__ import annotations

import os
from typing import Any

import ollama

from chatapp import config


def create_client(
    host: str | None = None,
    api_key: str | None = None,
    transport: Any = None,
) -> ollama.Client:
    """Build an ``ollama.Client`` for the web API (Ollama Cloud by default).

    ``transport`` is forwarded to the underlying ``httpx.Client`` so tests can
    inject ``httpx.MockTransport`` and exercise the real HTTP layer offline.
    """
    host = host or config.get_host()
    api_key = api_key if api_key is not None else config.get_api_key()

    kwargs: dict[str, Any] = {'host': host}
    if api_key:
        # The SDK only pulls the key from the OLLAMA_API_KEY env var, so pass an
        # explicit Authorization header; BaseClient lower-cases it for us.
        kwargs['headers'] = {'authorization': f'Bearer {api_key}'}
    if transport is not None:
        kwargs['transport'] = transport

    return ollama.Client(**kwargs)


def has_bearer_auth(client: ollama.Client) -> bool:
    return client._client.headers.get('authorization', '').startswith('Bearer ')  # noqa: SLF001
