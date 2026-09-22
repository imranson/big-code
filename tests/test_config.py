from __future__ import annotations

from chatapp.config import load_config


def test_defaults_when_no_secrets():
  cfg = load_config({})
  assert cfg.host == 'https://ollama.com'
  assert cfg.api_key == ''
  assert cfg.default_model == 'gpt-oss:120b-cloud'
  assert cfg.has_api_key is False


def test_secrets_are_used():
  cfg = load_config({'OLLAMA_API_KEY': 'secret', 'OLLAMA_HOST': 'https://example.com'})
  assert cfg.api_key == 'secret'
  assert cfg.host == 'https://example.com'
  assert cfg.has_api_key is True


def test_env_overrides_secrets(monkeypatch):
  monkeypatch.setenv('OLLAMA_API_KEY', 'from-env')
  cfg = load_config({'OLLAMA_API_KEY': 'from-secret'})
  assert cfg.api_key == 'from-env'


def test_models_parsed_from_list():
  cfg = load_config({'MODELS': ['a:cloud', 'b:cloud']})
  assert cfg.models == ('a:cloud', 'b:cloud')


def test_models_parsed_from_comma_string():
  cfg = load_config({'MODELS': 'a:cloud, b:cloud'})
  assert cfg.models == ('a:cloud', 'b:cloud')
