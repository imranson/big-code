from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Mapping

DEFAULT_HOST = 'https://ollama.com'
DEFAULT_NUM_CTX = 32768
DEFAULT_MODELS = (
  'gpt-oss:120b-cloud',
  'kimi-k2.6:cloud',
)
DEFAULT_MODEL = 'gpt-oss:120b-cloud'


@dataclass(frozen=True)
class Config:
  api_key: str = ''
  host: str = DEFAULT_HOST
  models: tuple[str, ...] = DEFAULT_MODELS
  default_model: str = DEFAULT_MODEL
  default_num_ctx: int = DEFAULT_NUM_CTX

  @property
  def has_api_key(self) -> bool:
    return bool(self.api_key)


def _as_models(value: Any) -> tuple[str, ...]:
  if value is None:
    return DEFAULT_MODELS
  if isinstance(value, str):
    return tuple(m.strip() for m in value.split(',') if m.strip())
  if isinstance(value, (list, tuple)):
    return tuple(str(m).strip() for m in value if str(m).strip())
  return DEFAULT_MODELS


def load_config(secrets: Mapping[str, Any] | None = None) -> Config:
  """Build a Config from environment variables and an optional secrets mapping.

  Environment variables (`OLLAMA_API_KEY`, `OLLAMA_HOST`) take precedence over
  the secrets mapping (e.g. ``st.secrets``).
  """
  secrets = secrets or {}
  api_key = os.getenv('OLLAMA_API_KEY') or str(secrets.get('OLLAMA_API_KEY') or '')
  host = os.getenv('OLLAMA_HOST') or str(secrets.get('OLLAMA_HOST') or DEFAULT_HOST)
  models = _as_models(secrets.get('MODELS'))
  default_model = str(secrets.get('DEFAULT_MODEL') or DEFAULT_MODEL)
  num_ctx = secrets.get('DEFAULT_NUM_CTX') or DEFAULT_NUM_CTX

  return Config(
    api_key=api_key,
    host=host,
    models=models,
    default_model=default_model,
    default_num_ctx=int(num_ctx),
  )
