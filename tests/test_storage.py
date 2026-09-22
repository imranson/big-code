from __future__ import annotations

import json

from chatapp.conversation import Conversation


def test_save_and_get_round_trip(storage):
  c = Conversation.new(model='m')
  c.add_message('user', 'hi')
  storage.save(c)
  loaded = storage.get(c.id)
  assert loaded is not None
  assert loaded.messages == c.messages


def test_list_active_and_archived(storage):
  a = Conversation.new()
  b = Conversation.new()
  storage.save(a)
  storage.save(b)
  assert {c.id for c in storage.list_active()} == {a.id, b.id}
  assert storage.list_archived() == []


def test_archive_moves_to_archive_dir(storage):
  c = Conversation.new()
  storage.save(c)
  archived = storage.archive(c.id)
  assert archived is not None and archived.archived is True
  assert storage.get(c.id).archived is True
  assert storage.list_active() == []
  assert [x.id for x in storage.list_archived()] == [c.id]
  assert (storage.archive_dir / f'{c.id}.json').exists()


def test_restore_moves_back(storage):
  c = Conversation.new()
  storage.save(c)
  storage.archive(c.id)
  storage.restore(c.id)
  assert storage.list_archived() == []
  assert [x.id for x in storage.list_active()] == [c.id]
  assert (storage.active_dir / f'{c.id}.json').exists()


def test_delete(storage):
  c = Conversation.new()
  storage.save(c)
  assert storage.delete(c.id) is True
  assert storage.get(c.id) is None
  assert storage.delete(c.id) is False


def test_saved_file_is_valid_json(storage):
  c = Conversation.new()
  c.add_message('user', 'hello')
  storage.save(c)
  data = json.loads((storage.active_dir / f'{c.id}.json').read_text(encoding='utf-8'))
  assert data['id'] == c.id
  assert data['messages'][0]['role'] == 'user'
