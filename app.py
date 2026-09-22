"""Streamlit front end for the Ollama web chat application.

Run with::

    streamlit run app.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Make the repo root importable regardless of the working directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import streamlit as st  # noqa: E402

# Copy secrets into the environment before any config is read.
try:
    _secrets = st.secrets
except Exception:  # noqa: BLE001 - secrets are optional
    _secrets = {}
for _key in ('OLLAMA_API_KEY', 'OLLAMA_HOST'):
    if not os.environ.get(_key):
        try:
            _value = _secrets.get(_key)
        except Exception:  # noqa: BLE001
            _value = None
        if _value:
            os.environ[_key] = str(_value)

from chatapp import config  # noqa: E402
from chatapp.chat_service import stream_chat  # noqa: E402
from chatapp.context_window import build_usage  # noqa: E402
from chatapp.conversation import Conversation, Message  # noqa: E402
from chatapp.ollama_client import create_client  # noqa: E402
from chatapp.storage import ConversationStore  # noqa: E402
from chatapp.tools import build_tool_schemas, make_executors  # noqa: E402

THINK_OPTIONS = ['off', 'on', 'low', 'medium', 'high']
THINK_MAP = {'off': None, 'on': True, 'low': 'low', 'medium': 'medium', 'high': 'high'}


def _render_message(message: Message) -> None:
    if message.role == 'tool':
        st.caption(f'🔧 Tool `{message.tool_name}` returned:')
        st.markdown(message.content)
        return

    with st.chat_message('assistant' if message.role == 'assistant' else 'user'):
        if message.thinking:
            with st.expander('💭 Thinking', expanded=False):
                st.markdown(message.thinking)
        if message.content:
            st.markdown(message.content)
        if message.tool_calls:
            with st.expander('🔧 Tool calls', expanded=False):
                for tc in message.tool_calls:
                    st.markdown(f'**`{tc.name}`**')
                    st.code(json.dumps(tc.arguments, indent=2), language='json')


def _stream_assistant_turn(
    *,
    client,
    conversation: Conversation,
    model: str,
    think,
    context_window: int,
) -> None:
    tools = build_tool_schemas()
    executors = make_executors(client)

    with st.chat_message('assistant'):
        think_expander = st.expander('💭 Thinking', expanded=False)
        think_ph = think_expander.empty()
        content_ph = st.empty()
        tool_expander = st.expander('🔧 Tool calls', expanded=False)
        tool_ph = tool_expander.empty()

        acc_content = ''
        acc_thinking = ''
        tool_lines: list[str] = []
        last_stats: dict | None = None

        for event in stream_chat(
            client=client,
            conversation=conversation,
            model=model,
            tools=tools,
            executors=executors,
            think=think,
        ):
            etype = event['type']
            if etype == 'thinking_delta':
                acc_thinking += event['text']
                think_ph.markdown(acc_thinking)
            elif etype == 'content_delta':
                acc_content += event['text']
                content_ph.markdown(acc_content)
            elif etype == 'tool_call':
                tool_lines.append(f"**`{event['name']}`** called with `{event['arguments']}`")
                tool_ph.markdown('\n\n'.join(tool_lines))
            elif etype == 'tool_result':
                tool_lines.append(
                    f"Result from `{event['name']}`:\n\n```\n{event['content']}\n```"
                )
                tool_ph.markdown('\n\n'.join(tool_lines))
            elif etype in ('assistant_message', 'done'):
                last_stats = event.get('stats')
            elif etype == 'error':
                st.error(event['message'])
                break

        if acc_content:
            content_ph.markdown(acc_content)

        if last_stats:
            parts = []
            if last_stats.get('prompt_eval_count') is not None:
                parts.append(f"prompt {last_stats['prompt_eval_count']} tok")
            if last_stats.get('eval_count') is not None:
                parts.append(f"generated {last_stats['eval_count']} tok")
            if last_stats.get('total_duration') is not None:
                parts.append(f"{last_stats['total_duration'] / 1e9:.2f}s")
            if parts:
                st.caption(' · '.join(parts))

        usage = build_usage(
            conversation,
            context_window=context_window,
            last_prompt_tokens=last_stats.get('prompt_eval_count') if last_stats else None,
            last_eval_tokens=last_stats.get('eval_count') if last_stats else None,
        )
        st.caption(
            f'Context: ~{usage.estimated_tokens:,} / {usage.context_window:,} tokens '
            f'({usage.percent_used:.1f}% used)'
        )


def main() -> None:
    st.set_page_config(page_title='Ollama Web Chat', page_icon='💬', layout='wide')
    st.title('💬 Ollama Web Chat')

    # --- session state defaults ---
    for key, default in (
        ('model', config.DEFAULT_MODEL),
        ('think', 'off'),
        ('context_window', config.DEFAULT_CONTEXT_WINDOW),
        ('system_prompt_template', config.DEFAULT_SYSTEM_PROMPT),
        ('conversation_id', None),
    ):
        if key not in st.session_state:
            st.session_state[key] = default
    if 'store' not in st.session_state:
        st.session_state.store = ConversationStore(config.get_data_dir())

    store: ConversationStore = st.session_state.store
    conversation_id: str | None = st.session_state.conversation_id

    conversation: Conversation | None = None
    if conversation_id and store.exists(conversation_id):
        conversation = store.load(conversation_id)
    elif conversation_id:
        st.session_state.conversation_id = None

    # --- sidebar ---
    with st.sidebar:
        st.header('Settings')
        st.text_input('Model', key='model')
        st.selectbox('Thinking', THINK_OPTIONS, key='think')
        st.number_input(
            'Context window (tokens)',
            min_value=256,
            step=256,
            key='context_window',
        )
        st.text_area('System prompt', key='system_prompt_template', height=180)
        st.caption('Placeholders: `{assistant_name}`, `{current_date}`, `{current_time}`, `{model}`')

        st.divider()
        if st.button('➕ New conversation', use_container_width=True):
            new_convo = Conversation.new(
                model=st.session_state.model,
                system_prompt=config.render_system_prompt(
                    st.session_state.system_prompt_template,
                    model=st.session_state.model,
                ),
            )
            store.save(new_convo)
            st.session_state.conversation_id = new_convo.id
            st.rerun()

        st.subheader('Conversations')
        active = store.list(archived=False)
        if not active:
            st.caption('No conversations yet.')
        for convo in active:
            cols = st.columns([4, 1])
            if cols[0].button(convo.title or convo.id, key=f'open_{convo.id}', use_container_width=True):
                st.session_state.conversation_id = convo.id
                st.rerun()
            if cols[1].button('📦', key=f'archive_{convo.id}', help='Archive'):
                store.archive(convo.id)
                if st.session_state.conversation_id == convo.id:
                    st.session_state.conversation_id = None
                st.rerun()

        with st.expander('Archived'):
            archived = store.list(archived=True)
            if not archived:
                st.caption('Archive is empty.')
            for convo in archived:
                cols = st.columns([4, 1, 1])
                cols[0].markdown(convo.title or convo.id)
                if cols[1].button('↩️', key=f'restore_{convo.id}', help='Restore'):
                    store.unarchive(convo.id)
                    st.rerun()
                if cols[2].button('🗑️', key=f'delete_{convo.id}', help='Delete'):
                    store.delete(convo.id, archived=True)
                    st.rerun()

        if conversation:
            usage = build_usage(
                conversation, context_window=st.session_state.context_window
            )
            st.subheader('Context window')
            st.progress(usage.percent_used / 100.0)
            st.caption(
                f'~{usage.estimated_tokens:,} / {usage.context_window:,} tokens '
                f'({usage.percent_used:.1f}% used)'
            )

    # --- main chat area ---
    if not config.get_api_key():
        st.warning(
            'No `OLLAMA_API_KEY` found. Set it in `.streamlit/secrets.toml` or the '
            '`OLLAMA_API_KEY` environment variable for web search/fetch and hosted models.'
        )

    if conversation:
        for message in conversation.messages:
            _render_message(message)
    else:
        st.info('Start a new conversation or pick one from the sidebar.')

    if prompt := st.chat_input('Message the assistant…'):
        if conversation is None:
            conversation = Conversation.new(
                model=st.session_state.model,
                system_prompt=config.render_system_prompt(
                    st.session_state.system_prompt_template,
                    model=st.session_state.model,
                ),
            )
            store.save(conversation)
            st.session_state.conversation_id = conversation.id

        if not conversation.has_user_message():
            conversation.title = prompt[:60]
        conversation.add_message(Message(role='user', content=prompt))
        store.save(conversation)

        st.chat_message('user').markdown(prompt)

        with create_client() as client:
            _stream_assistant_turn(
                client=client,
                conversation=conversation,
                model=st.session_state.model,
                think=THINK_MAP[st.session_state.think],
                context_window=st.session_state.context_window,
            )

        store.save(conversation)


if __name__ == '__main__':
    main()
