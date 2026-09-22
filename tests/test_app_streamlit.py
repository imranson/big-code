from __future__ import annotations

from pathlib import Path

from streamlit.testing.v1 import AppTest

APP = Path(__file__).resolve().parents[1] / 'app.py'


def test_app_renders(tmp_path, monkeypatch):
  monkeypatch.setenv('CHATAPP_DATA_DIR', str(tmp_path / 'data'))
  monkeypatch.setenv('OLLAMA_API_KEY', 'test-key')
  at = AppTest.from_file(str(APP), default_timeout=15).run()
  assert not at.exception
  assert at.title[0].value == 'Ollama Cloud Chat'
