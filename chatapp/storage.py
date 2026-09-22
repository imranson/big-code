from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from .conversation import Conversation


class Storage:
  """JSON-file persistence for conversations, split into active and archived folders."""

  def __init__(self, root: str | Path):
    self.root = Path(root)
    self.active_dir = self.root / 'conversations'
    self.archive_dir = self.root / 'archive'
    self.active_dir.mkdir(parents=True, exist_ok=True)
    self.archive_dir.mkdir(parents=True, exist_ok=True)

  def _path(self, conv_id: str, archived: bool = False) -> Path:
    base = self.archive_dir if archived else self.active_dir
    return base / f'{conv_id}.json'

  def _read(self, path: Path) -> Conversation:
    return Conversation.from_dict(json.loads(path.read_text(encoding='utf-8')))

  def save(self, conversation: Conversation) -> None:
    path = self._path(conversation.id, archived=conversation.archived)
    tmp = path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(conversation.to_dict(), indent=2), encoding='utf-8')
    os.replace(tmp, path)

  def get(self, conv_id: str) -> Optional[Conversation]:
    for archived in (False, True):
      path = self._path(conv_id, archived)
      if path.exists():
        return self._read(path)
    return None

  def _list(self, directory: Path) -> list[Conversation]:
    result = []
    for path in directory.glob('*.json'):
      try:
        result.append(self._read(path))
      except (json.JSONDecodeError, KeyError, TypeError):
        continue
    result.sort(key=lambda c: c.updated_at, reverse=True)
    return result

  def list_active(self) -> list[Conversation]:
    return self._list(self.active_dir)

  def list_archived(self) -> list[Conversation]:
    return self._list(self.archive_dir)

  def delete(self, conv_id: str) -> bool:
    for archived in (False, True):
      path = self._path(conv_id, archived)
      if path.exists():
        path.unlink()
        return True
    return False

  def archive(self, conv_id: str) -> Optional[Conversation]:
    src = self._path(conv_id, archived=False)
    if not src.exists():
      return None
    conv = self._read(src)
    conv.archived = True
    self.save(conv)  # writes to archive_dir
    src.unlink()
    return conv

  def restore(self, conv_id: str) -> Optional[Conversation]:
    src = self._path(conv_id, archived=True)
    if not src.exists():
      return None
    conv = self._read(src)
    conv.archived = False
    self.save(conv)  # writes to active_dir
    src.unlink()
    return conv
