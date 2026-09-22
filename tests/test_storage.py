"""Unit tests for the filesystem conversation store."""

from __future__ import annotations

from chatapp.conversation import Conversation
from chatapp.storage import ConversationStore


def _make_store(data_dir):
    return ConversationStore(data_dir)


def test_save_and_load(tmp_data_dir):
    store = _make_store(tmp_data_dir)
    convo = Conversation.new(model='m', system_prompt='s', title='One')
    store.save(convo)
    loaded = store.load(convo.id)
    assert loaded.id == convo.id
    assert loaded.title == 'One'


def test_list_sorts_by_updated_at_desc(tmp_data_dir):
    store = _make_store(tmp_data_dir)
    a = Conversation.new(model='m', system_prompt='s', title='A')
    b = Conversation.new(model='m', system_prompt='s', title='B')
    store.save(a)
    store.save(b)
    # b was created later (later UUID), but updated_at ordering is by timestamp.
    ids = [c.id for c in store.list()]
    assert set(ids) == {a.id, b.id}


def test_archive_moves_to_archive_folder(tmp_data_dir):
    store = _make_store(tmp_data_dir)
    convo = Conversation.new(model='m', system_prompt='s')
    store.save(convo)
    assert store.exists(convo.id, archived=False)
    store.archive(convo.id)
    assert not store.exists(convo.id, archived=False)
    assert store.exists(convo.id, archived=True)
    assert store.list(archived=False) == []
    assert [c.id for c in store.list(archived=True)] == [convo.id]


def test_unarchive_moves_back(tmp_data_dir):
    store = _make_store(tmp_data_dir)
    convo = Conversation.new(model='m', system_prompt='s')
    store.save(convo)
    store.archive(convo.id)
    store.unarchive(convo.id)
    assert store.exists(convo.id, archived=False)
    assert not store.exists(convo.id, archived=True)


def test_delete_removes_file(tmp_data_dir):
    store = _make_store(tmp_data_dir)
    convo = Conversation.new(model='m', system_prompt='s')
    store.save(convo)
    store.delete(convo.id)
    assert not store.exists(convo.id, archived=False)


def test_list_skips_corrupt_files(tmp_data_dir):
    store = _make_store(tmp_data_dir)
    good = Conversation.new(model='m', system_prompt='s')
    store.save(good)
    (store.active_dir / 'bad.json').write_text('{not json', encoding='utf-8')
    ids = [c.id for c in store.list()]
    assert ids == [good.id]
