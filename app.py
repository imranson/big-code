from __future__ import annotations

import os
import time
from pathlib import Path

import streamlit as st

from chatapp.chat_service import ChatService
from chatapp.config import Config, load_config
from chatapp.context_window import context_length_for, context_usage, conversation_tokens
from chatapp.conversation import Conversation
from chatapp.ollama_client import OllamaClient
from chatapp.storage import Storage

REPO_ROOT = Path(__file__).resolve().parent


def data_dir() -> Path:
  return Path(os.getenv('CHATAPP_DATA_DIR', str(REPO_ROOT / 'data')))


def _read_secrets() -> dict:
  out: dict = {}
  for key in ('OLLAMA_API_KEY', 'OLLAMA_HOST', 'MODELS', 'DEFAULT_MODEL', 'DEFAULT_NUM_CTX'):
    try:
      value = st.secrets[key]
      if value is not None:
        out[key] = value
    except Exception:
      pass
  return out


st.set_page_config(page_title='Ollama Cloud Chat', layout='wide')
config: Config = load_config(_read_secrets())


@st.cache_resource
def get_storage() -> Storage:
  return Storage(data_dir())


@st.cache_resource
def get_client() -> OllamaClient:
  return OllamaClient(config.host, config.api_key)


storage = get_storage()
client = get_client()
service = ChatService(client)


def _enabled_tools(search: bool, fetch: bool, datetime_: bool) -> set[str]:
  enabled: set[str] = set()
  if search:
    enabled.add('web_search')
  if fetch:
    enabled.add('web_fetch')
  if datetime_:
    enabled.add('get_current_datetime')
  return enabled


def render_sidebar(config: Config) -> dict:
  st.sidebar.title('Ollama Cloud Chat')

  if not config.has_api_key:
    st.sidebar.warning('No API key found. Add `OLLAMA_API_KEY` to `.streamlit/secrets.toml`.')

  model_options = list(config.models)
  default_index = model_options.index(config.default_model) if config.default_model in model_options else 0
  selected = st.sidebar.selectbox('Model', model_options, index=default_index, key='model_select')
  custom_model = st.sidebar.text_input('Custom model (overrides above)', key='custom_model')
  model = custom_model.strip() or selected

  think = st.sidebar.checkbox('Thinking', value=False, key='think_toggle')

  st.sidebar.markdown('#### Tools')
  enable_search = st.sidebar.checkbox('Web search', value=True, key='tool_search')
  enable_fetch = st.sidebar.checkbox('Web fetch', value=True, key='tool_fetch')
  enable_datetime = st.sidebar.checkbox('Current date/time', value=True, key='tool_datetime')

  system_prompt = st.sidebar.text_area('System prompt', value='', key='system_prompt')

  num_ctx = st.sidebar.number_input(
    'Context length (tokens)',
    min_value=1024,
    max_value=1_000_000,
    value=context_length_for(model),
    step=1024,
    key='num_ctx',
  )

  return {
    'model': model,
    'think': think,
    'enabled_tools': _enabled_tools(enable_search, enable_fetch, enable_datetime),
    'system_prompt': system_prompt,
    'num_ctx': int(num_ctx),
  }


def render_conversation_list(storage: Storage) -> str | None:
  active = storage.list_active()
  st.sidebar.markdown('#### Conversations')

  if st.sidebar.button('➕ New conversation', use_container_width=True):
    st.session_state.current_id = None
    st.rerun()

  labels = {c.id: c.title for c in active}
  ids = [c.id for c in active]
  current = st.session_state.get('current_id')

  if ids:
    index = ids.index(current) if current in ids else 0
    selected = st.sidebar.selectbox(
      'Select conversation',
      ids,
      index=index,
      format_func=lambda cid: labels.get(cid, cid),
      key='conv_select',
    )
    st.session_state.current_id = selected
  else:
    st.sidebar.caption('No conversations yet.')

  current = st.session_state.get('current_id')
  if current and st.sidebar.button('📦 Archive conversation', use_container_width=True):
    storage.archive(current)
    st.session_state.current_id = None
    st.rerun()

  archived = storage.list_archived()
  if archived:
    with st.sidebar.expander('Archived'):
      for c in archived:
        left, right = st.columns([3, 1])
        left.write(c.title)
        if right.button('↩️', key=f'restore_{c.id}', help='Restore'):
          storage.restore(c.id)
          st.rerun()
        if right.button('🗑️', key=f'delete_{c.id}', help='Delete forever'):
          storage.delete(c.id)
          st.rerun()

  return st.session_state.get('current_id')


def render_messages(convo: Conversation) -> None:
  for msg in convo.messages:
    role = msg.get('role')
    if role == 'user':
      st.chat_message('user').write(msg.get('content', ''))
    elif role == 'assistant':
      with st.chat_message('assistant'):
        thinking = msg.get('thinking')
        if thinking:
          with st.expander('🧠 Thinking'):
            st.write(thinking)
        st.write(msg.get('content', ''))
    elif role == 'tool':
      with st.expander(f'🔧 Tool: {msg.get("tool_name", "unknown")}'):
        st.caption(msg.get('content', '')[:500])


st.title('Ollama Cloud Chat')
settings = render_sidebar(config)
current_id = render_conversation_list(storage)

convo = storage.get(current_id) if current_id else None

if convo:
  used = conversation_tokens(convo.messages, settings['system_prompt'])
  total = context_length_for(settings['model'], settings['num_ctx'])
  usage = context_usage(used, total)
  st.sidebar.markdown('#### Context window')
  st.sidebar.progress(usage['fraction'])
  st.sidebar.caption(
    f"{usage['used_tokens']:,} / {usage['context_length']:,} tokens (~{usage['percent']}%)"
  )
  render_messages(convo)
else:
  st.info('Start a new conversation by typing a message below.')

user_input = st.chat_input('Message Ollama…')
if user_input:
  if not config.has_api_key:
    st.error('No API key set — cannot chat. Add `OLLAMA_API_KEY` to `.streamlit/secrets.toml`.')
  else:
    convo = convo or Conversation.new(model=settings['model'], system_prompt=settings['system_prompt'])
    with st.spinner('Thinking…'):
      try:
        result = service.run(
          model=settings['model'],
          user_input=user_input,
          history=list(convo.messages),
          system_prompt=settings['system_prompt'],
          think=settings['think'],
          enabled_tools=settings['enabled_tools'],
          num_ctx=settings['num_ctx'],
        )
      except Exception as exc:
        st.error(f'Chat failed: {exc}')
        result = None

    if result is not None:
      convo.messages = result.messages
      convo.model = settings['model']
      convo.system_prompt = settings['system_prompt']
      convo.updated_at = time.time()
      convo.derive_title()
      storage.save(convo)
      st.session_state.current_id = convo.id
      st.rerun()
