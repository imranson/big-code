"""Smoke tests for the Streamlit app via streamlit.testing.AppTest."""

from __future__ import annotations

import pytest

from conftest import REPO_ROOT

APP = REPO_ROOT / 'app.py'


@pytest.fixture
def app(monkeypatch, tmp_path):
    monkeypatch.setenv('OLLAMA_API_KEY', 'fake-key')
    monkeypatch.setenv('CHATAPP_DATA_DIR', str(tmp_path / 'data'))
    at = pytest.importorskip('streamlit.testing.v1').AppTest.from_file(
        str(APP), default_timeout=30
    )
    at.run()
    return at, tmp_path / 'data'


def test_app_renders_without_exception(app):
    at, _ = app
    assert not at.exception


def test_sidebar_has_expected_widgets(app):
    at, _ = app
    labels = [b.label for b in at.button]
    assert '➕ New conversation' in labels
    assert at.chat_input is not None
    assert any(ti.label == 'Model' for ti in at.text_input)


def test_new_conversation_button_creates_file(app):
    at, data_dir = app
    labels = [b.label for b in at.button]
    at.button[labels.index('➕ New conversation')].click().run()
    assert not at.exception
    files = list((data_dir / 'conversations').glob('*.json'))
    assert len(files) == 1
