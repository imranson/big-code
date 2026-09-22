"""Unit tests for context-window estimation."""

from __future__ import annotations

from chatapp.conversation import Conversation, Message, ToolCall
from chatapp.context_window import (
    build_usage,
    estimate_conversation_tokens,
    estimate_tokens,
)


def test_estimate_tokens_empty():
    assert estimate_tokens('') == 0


def test_estimate_tokens_roughly_chars_over_four():
    assert estimate_tokens('12345678') == 2  # 8 chars / 4


def test_estimate_conversation_includes_system_and_tools():
    convo = Conversation.new(model='m', system_prompt='sys prompt')
    convo.add_message(Message(role='user', content='hello'))
    convo.add_message(
        Message(
            role='assistant',
            content='hi',
            tool_calls=[ToolCall('web_search', {'query': 'x'})],
        )
    )
    total = estimate_conversation_tokens(convo)
    assert total > 0


def test_build_usage_percent_clamps_at_100():
    convo = Conversation.new(model='m', system_prompt='x' * 1000)
    usage = build_usage(convo, context_window=10)
    assert usage.percent_used == 100.0


def test_build_usage_carries_last_tokens():
    convo = Conversation.new(model='m', system_prompt='s')
    usage = build_usage(convo, context_window=1000, last_prompt_tokens=42, last_eval_tokens=7)
    assert usage.last_prompt_tokens == 42
    assert usage.last_eval_tokens == 7
    assert usage.remaining_tokens >= 0
