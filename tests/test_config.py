"""Unit tests for config defaults and system-prompt rendering."""

from __future__ import annotations

from datetime import datetime

import pytest

from chatapp import config


@pytest.fixture(autouse=True)
def _isolate_secrets(monkeypatch, tmp_path):
    """Point CHATAPP_SECRETS_FILE at a missing file so tests are hermetic."""
    monkeypatch.setenv('CHATAPP_SECRETS_FILE', str(tmp_path / 'nonexistent.toml'))


def test_default_host_is_cloud():
    assert config.get_host() == 'https://ollama.com'


def test_host_from_environment(monkeypatch):
    monkeypatch.setenv('OLLAMA_HOST', 'https://example.com')
    assert config.get_host() == 'https://example.com'


def test_api_key_from_environment(monkeypatch):
    monkeypatch.setenv('OLLAMA_API_KEY', 'abc123')
    assert config.get_api_key() == 'abc123'


def test_api_key_none_when_missing(monkeypatch):
    monkeypatch.delenv('OLLAMA_API_KEY', raising=False)
    assert config.get_api_key() is None


def test_api_key_read_from_secrets_file(monkeypatch, tmp_path):
    secrets = tmp_path / 'secrets.toml'
    secrets.write_text('OLLAMA_API_KEY = "file-key"\n', encoding='utf-8')
    monkeypatch.delenv('OLLAMA_API_KEY', raising=False)
    monkeypatch.setenv('CHATAPP_SECRETS_FILE', str(secrets))
    assert config.get_api_key() == 'file-key'


def test_env_takes_precedence_over_secrets_file(monkeypatch, tmp_path):
    secrets = tmp_path / 'secrets.toml'
    secrets.write_text('OLLAMA_API_KEY = "file-key"\n', encoding='utf-8')
    monkeypatch.setenv('CHATAPP_SECRETS_FILE', str(secrets))
    monkeypatch.setenv('OLLAMA_API_KEY', 'env-key')
    assert config.get_api_key() == 'env-key'


def test_load_secrets_returns_empty_when_missing(monkeypatch, tmp_path):
    monkeypatch.setenv('CHATAPP_SECRETS_FILE', str(tmp_path / 'nope.toml'))
    assert config.load_secrets() == {}


def test_load_secrets_ignores_non_scalar_values(monkeypatch, tmp_path):
    secrets = tmp_path / 'secrets.toml'
    secrets.write_text(
        'OLLAMA_API_KEY = "k"\n[section]\nnested = "x"\n', encoding='utf-8'
    )
    monkeypatch.setenv('CHATAPP_SECRETS_FILE', str(secrets))
    assert config.load_secrets() == {'OLLAMA_API_KEY': 'k'}


def test_render_system_prompt_fills_parameters():
    rendered = config.render_system_prompt(
        config.DEFAULT_SYSTEM_PROMPT,
        model='mymodel',
        assistant_name='Bob',
        now=datetime(2026, 9, 22, 13, 45, 6),
    )
    assert 'Bob' in rendered
    assert 'mymodel' in rendered
    assert '2026-09-22' in rendered
    assert '13:45:06' in rendered


def test_render_system_prompt_leaves_unknown_placeholders_intact():
    rendered = config.render_system_prompt('Hello {unknown} and {assistant_name}')
    assert '{unknown}' in rendered
    assert 'Assistant' in rendered


def test_data_dir_from_environment(monkeypatch, tmp_path):
    monkeypatch.setenv('CHATAPP_DATA_DIR', str(tmp_path))
    assert config.get_data_dir() == str(tmp_path)
