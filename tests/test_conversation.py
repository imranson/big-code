"""Unit tests for conversation and message models."""

from __future__ import annotations

from chatapp.conversation import Conversation, Message, ToolCall


def test_new_conversation_has_id_and_title():
    convo = Conversation.new(model='m', system_prompt='s', title='Hi')
    assert convo.id
    assert convo.title == 'Hi'
    assert convo.messages == []


def test_message_to_ollama_includes_tool_calls():
    msg = Message(
        role='assistant',
        content='answer',
        thinking='hmm',
        tool_calls=[ToolCall(name='web_search', arguments={'query': 'x'})],
    )
    d = msg.to_ollama()
    assert d['role'] == 'assistant'
    assert d['content'] == 'answer'
    assert d['thinking'] == 'hmm'
    assert d['tool_calls'] == [
        {'function': {'name': 'web_search', 'arguments': {'query': 'x'}}}
    ]


def test_message_roundtrip():
    msg = Message(role='tool', content='result', tool_name='web_search')
    assert Message.from_dict(msg.to_dict()) == msg


def test_conversation_roundtrip():
    convo = Conversation.new(model='m', system_prompt='s')
    convo.add_message(Message(role='user', content='hi'))
    convo.add_message(
        Message(role='assistant', content='yo', thinking='t', tool_calls=[ToolCall('w', {'q': 1})])
    )
    restored = Conversation.from_dict(convo.to_dict())
    assert restored.id == convo.id
    assert restored.model == 'm'
    assert restored.messages == convo.messages


def test_ollama_messages_prepends_system_prompt():
    convo = Conversation.new(model='m', system_prompt='You are helpful.')
    convo.add_message(Message(role='user', content='hi'))
    msgs = convo.ollama_messages()
    assert msgs[0] == {'role': 'system', 'content': 'You are helpful.'}
    assert msgs[1]['role'] == 'user'


def test_has_user_message():
    convo = Conversation.new(model='m', system_prompt='s')
    assert not convo.has_user_message()
    convo.add_message(Message(role='user', content='hi'))
    assert convo.has_user_message()
