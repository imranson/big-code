from __future__ import annotations

from chatapp.context_window import (
  DEFAULT_CONTEXT,
  context_length_for,
  context_usage,
  conversation_tokens,
  estimate_tokens,
  message_tokens,
)


def test_estimate_tokens():
  assert estimate_tokens('') == 0
  assert estimate_tokens(None) == 0
  assert estimate_tokens('1234') == 1
  assert estimate_tokens('12345') == 2


def test_message_tokens_sums_fields():
  msg = {'role': 'user', 'content': 'a' * 40}
  assert message_tokens(msg) == 11  # 1 token (role) + 10 tokens (content)


def test_conversation_tokens_includes_system_prompt():
  msgs = [{'role': 'user', 'content': 'a' * 8}]
  total = conversation_tokens(msgs, system_prompt='b' * 8)
  assert total == estimate_tokens('b' * 8) + message_tokens(msgs[0])


def test_context_length_for_known_model():
  assert context_length_for('gpt-oss:120b-cloud') == 131072


def test_context_length_for_unknown_model():
  assert context_length_for('unknown-model') == DEFAULT_CONTEXT


def test_context_length_for_explicit_num_ctx():
  assert context_length_for('gpt-oss:120b-cloud', 4096) == 4096


def test_context_usage():
  usage = context_usage(500, 1000)
  assert usage['fraction'] == 0.5
  assert usage['percent'] == 50


def test_context_usage_clamps():
  assert context_usage(2000, 1000)['fraction'] == 1.0
  assert context_usage(-1, 1000)['fraction'] == 0.0
