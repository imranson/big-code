"""Filesystem-backed conversation storage with an archive folder."""

from __future__ import annotations

import json
from pathlib import Path

from chatapp.conversation import Conversation

ACTIVE_DIR_NAME = 'conversations'
ARCHIVE_DIR_NAME = 'archive'


class ConversationStore:
    """Stores each conversation as ``<id>.json`` in an active or archive folder."""

    def __init__(self, data_dir: str | Path) -> None:
        self.data_dir = Path(data_dir)
        self.active_dir = self.data_dir / ACTIVE_DIR_NAME
        self.archive_dir = self.data_dir / ARCHIVE_DIR_NAME
        self.active_dir.mkdir(parents=True, exist_ok=True)
        self.archive_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, conversation_id: str, archived: bool = False) -> Path:
        base = self.archive_dir if archived else self.active_dir
        return base / f'{conversation_id}.json'

    def save(self, conversation: Conversation, archived: bool = False) -> None:
        self._path(conversation.id, archived).write_text(
            json.dumps(conversation.to_dict(), indent=2), encoding='utf-8'
        )

    def load(self, conversation_id: str, archived: bool = False) -> Conversation:
        return Conversation.from_dict(
            json.loads(self._path(conversation_id, archived).read_text(encoding='utf-8'))
        )

    def exists(self, conversation_id: str, archived: bool = False) -> bool:
        return self._path(conversation_id, archived).exists()

    def list(self, archived: bool = False) -> list[Conversation]:
        base = self.archive_dir if archived else self.active_dir
        out: list[Conversation] = []
        for path in base.glob('*.json'):
            try:
                out.append(Conversation.from_dict(json.loads(path.read_text(encoding='utf-8'))))
            except (json.JSONDecodeError, KeyError, TypeError):
                # Skip corrupt / partially-written files rather than crashing the UI.
                continue
        out.sort(key=lambda c: c.updated_at, reverse=True)
        return out

    def archive(self, conversation_id: str) -> None:
        src = self._path(conversation_id, archived=False)
        if src.exists():
            src.rename(self._path(conversation_id, archived=True))

    def unarchive(self, conversation_id: str) -> None:
        src = self._path(conversation_id, archived=True)
        if src.exists():
            src.rename(self._path(conversation_id, archived=False))

    def delete(self, conversation_id: str, archived: bool = False) -> None:
        path = self._path(conversation_id, archived)
        if path.exists():
            path.unlink()
