"""Unit tests for the client factory."""

from __future__ import annotations

import httpx
import ollama

from chatapp.ollama_client import create_client, has_bearer_auth


def test_create_client_sets_host_and_auth(fake_api_key):
    client = create_client(host='https://ollama.com', api_key=fake_api_key)
    assert isinstance(client, ollama.Client)
    assert has_bearer_auth(client)
    client.close()


def test_create_client_no_auth_without_key(monkeypatch, tmp_path):
    monkeypatch.setenv('CHATAPP_SECRETS_FILE', str(tmp_path / 'nonexistent.toml'))
    monkeypatch.delenv('OLLAMA_API_KEY', raising=False)
    client = create_client(host='https://ollama.com', api_key=None)
    assert not has_bearer_auth(client)
    client.close()


def test_create_client_accepts_transport(fake_api_key):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    client = create_client(
        host='https://ollama.com',
        api_key=fake_api_key,
        transport=httpx.MockTransport(handler),
    )
    try:
        # A request should round-trip through the injected transport.
        response = client._client.get('https://ollama.com/')
        assert response.status_code == 200
    finally:
        client.close()
