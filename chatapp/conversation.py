from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Conversation:
  id: str
  title: str = 'New conversation'
  messages: list[dict] = field(default_factory=list)
  model: str = ''
  system_prompt: str = ''
  archived: bool = False
  created_at: float = field(default_factory=time.time)
  updated_at: float = field(default_factory=time.time)

  @classmethod
  def new(cls, model: str = '', system_prompt: str = '') -> 'Conversation':
    return cls(id=uuid.uuid4().hex, model=model, system_prompt=system_prompt)

  def add_message(self, role: str, content: str | None = None, **extra: Any) -> dict:
    """Append a message and return it as a plain dict (only truthy fields kept)."""
    msg: dict = {'role': role}
    if content:
      msg['content'] = content
    for key, value in extra.items():
      if value:
        msg[key] = value
    self.messages.append(msg)
    self.updated_at = time.time()
    return msg

  def derive_title(self) -> str:
    """Set the title from the first user message, truncated to 60 chars."""
    for m in self.messages:
      if m.get('role') == 'user' and m.get('content'):
        text = str(m['content']).strip()
        self.title = text[:60] + ('…' if len(text) > 60 else '')
        return self.title
    return self.title

  def to_dict(self) -> dict:
    return {
      'id': self.id,
      'title': self.title,
      'messages': self.messages,
      'model': self.model,
      'system_prompt': self.system_prompt,
      'archived': self.archived,
      'created_at': self.created_at,
      'updated_at': self.updated_at,
    }

  @classmethod
  def from_dict(cls, data: dict) -> 'Conversation':
    return cls(
      id=data['id'],
      title=data.get('title', 'New conversation'),
      messages=list(data.get('messages', [])),
      model=data.get('model', ''),
      system_prompt=data.get('system_prompt', ''),
      archived=bool(data.get('archived', False)),
      created_at=data.get('created_at', time.time()),
      updated_at=data.get('updated_at', time.time()),
    )
