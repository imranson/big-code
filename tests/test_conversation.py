from __future__ import annotations

from chatapp.conversation import Conversation


def test_new_has_unique_id_and_empty_messages():
  a = Conversation.new()
  b = Conversation.new()
  assert a.id and a.id != b.id
  assert a.messages == []
  assert a.archived is False


def test_add_message_records_truthy_fields():
  c = Conversation.new()
  msg = c.add_message('assistant', 'hello', thinking='hmm', tool_name=None)
  assert msg == {'role': 'assistant', 'content': 'hello', 'thinking': 'hmm'}
  assert c.messages == [msg]


def test_derive_title_truncates():
  c = Conversation.new()
  c.add_message('user', 'x' * 100)
  c.derive_title()
  assert len(c.title) <= 61  # 60 chars + ellipsis


def test_derive_title_uses_first_user_message():
  c = Conversation.new()
  c.add_message('assistant', 'nope')
  c.add_message('user', 'the real question')
  c.derive_title()
  assert c.title == 'the real question'


def test_round_trip_preserves_tool_calls():
  c = Conversation.new(model='m', system_prompt='sys')
  c.add_message(
    'assistant',
    tool_calls=[{'function': {'name': 'web_search', 'arguments': {'query': 'q'}}}],
  )
  c.add_message('tool', 'result', tool_name='web_search')
  restored = Conversation.from_dict(c.to_dict())
  assert restored.id == c.id
  assert restored.model == 'm'
  assert restored.system_prompt == 'sys'
  assert restored.messages == c.messages
