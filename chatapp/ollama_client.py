from __future__ import annotations

from typing import Any, Mapping, Sequence

from ollama import Client as OllamaSDKClient


def build_headers(api_key: str | None) -> dict[str, str] | None:
  """Return the Authorization headers for the Ollama cloud API, if a key is set."""
  if api_key:
    return {'Authorization': f'Bearer {api_key}'}
  return None


class OllamaClient:
  """Thin wrapper over the Ollama Python SDK, pinned to the cloud API.

  ``host`` is expected to be ``https://ollama.com`` so that ``chat`` targets the
  cloud ``/api/chat`` endpoint rather than a local Ollama server. ``web_search``
  and ``web_fetch`` always hit ``https://ollama.com/api/*`` regardless of host.
  """

  def __init__(self, host: str, api_key: str | None = None, client: Any = None):
    self.host = host
    self.api_key = api_key or ''
    if client is not None:
      self._client = client
    else:
      self._client = OllamaSDKClient(host=self.host, headers=build_headers(self.api_key))

  def chat(
    self,
    model: str,
    messages: Sequence[Mapping[str, Any]],
    *,
    tools: Sequence | None = None,
    think: bool | str | None = None,
    options: Mapping[str, Any] | None = None,
  ):
    return self._client.chat(
      model=model,
      messages=messages,
      tools=tools,
      think=think,
      options=options,
    )

  def web_search(self, query: str, max_results: int = 3):
    return self._client.web_search(query, max_results=max_results)

  def web_fetch(self, url: str):
    return self._client.web_fetch(url)
