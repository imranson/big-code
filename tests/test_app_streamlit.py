from __future__ import annotations

from pathlib import Path

import pytest
import streamlit as st
from streamlit.testing.v1 import AppTest

from chatapp.conversation import Conversation
from chatapp.storage import Storage

APP = Path(__file__).resolve().parents[1] / 'app.py'


@pytest.fixture(autouse=True)
def _clear_streamlit_cache():
  # st.cache_resource is process-global in AppTest's bare mode, so clear it
  # between tests to keep each test's seeded data directory isolated.
  st.cache_resource.clear()
  yield


def test_app_renders(tmp_path, monkeypatch):
  monkeypatch.setenv('CHATAPP_DATA_DIR', str(tmp_path / 'data'))
  monkeypatch.setenv('OLLAMA_API_KEY', 'test-key')
  at = AppTest.from_file(str(APP), default_timeout=15).run()
  assert not at.exception
  assert at.title[0].value == 'Ollama Cloud Chat'


def _seed_conversation(data_dir: Path) -> str:
  storage = Storage(data_dir)
  convo = Conversation.new(model='test-model')
  convo.title = 'Existing conversation'
  convo.messages = [{'role': 'user', 'content': 'hello'}]
  storage.save(convo)
  return convo.id


def test_new_conversation_button_clears_selection(tmp_path, monkeypatch):
  monkeypatch.setenv('OLLAMA_API_KEY', 'test-key')
  data_dir = tmp_path / 'data'
  conv_id = _seed_conversation(data_dir)
  monkeypatch.setenv('CHATAPP_DATA_DIR', str(data_dir))

  at = AppTest.from_file(str(APP), default_timeout=15).run()
  assert not at.exception

  conv_select = next(sb for sb in at.selectbox if sb.label == 'Select conversation')

  # A conversation exists, so it is auto-selected on load.
  assert conv_select.value == conv_id
  assert at.session_state['current_id'] == conv_id

  new_btn = next(b for b in at.button if 'New conversation' in b.label)
  at = new_btn.click().run()
  assert not at.exception

  # The active selection is cleared, leaving the app in the blank "new" state.
  assert at.session_state['current_id'] is None
  conv_select = next(sb for sb in at.selectbox if sb.label == 'Select conversation')
  assert conv_select.value != conv_id
  assert any('Start a new conversation' in info.value for info in at.info)
