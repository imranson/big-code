"""Conversation and message data models with JSON (de)serialisation."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class ToolCall:
    name: str
    arguments: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {'name': self.name, 'arguments': self.arguments}

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> 'ToolCall':
        return cls(name=d.get('name', ''), arguments=d.get('arguments') or {})


@dataclass
class Message:
    role: str
    content: str = ''
    thinking: str = ''
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_name: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {'role': self.role}
        if self.content:
            d['content'] = self.content
        if self.thinking:
            d['thinking'] = self.thinking
        if self.tool_calls:
            d['tool_calls'] = [tc.to_dict() for tc in self.tool_calls]
        if self.tool_name:
            d['tool_name'] = self.tool_name
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> 'Message':
        return cls(
            role=d.get('role', ''),
            content=d.get('content', ''),
            thinking=d.get('thinking', ''),
            tool_calls=[ToolCall.from_dict(t) for t in d.get('tool_calls', [])],
            tool_name=d.get('tool_name'),
        )

    def to_ollama(self) -> dict[str, Any]:
        """Render as a dict matching the Ollama ``Message`` schema."""
        d: dict[str, Any] = {'role': self.role}
        if self.content:
            d['content'] = self.content
        if self.thinking:
            d['thinking'] = self.thinking
        if self.tool_calls:
            d['tool_calls'] = [
                {'function': {'name': tc.name, 'arguments': tc.arguments}}
                for tc in self.tool_calls
            ]
        if self.tool_name:
            d['tool_name'] = self.tool_name
        return d


@dataclass
class Conversation:
    id: str
    title: str
    model: str
    system_prompt: str
    created_at: str
    updated_at: str
    messages: list[Message] = field(default_factory=list)

    @classmethod
    def new(
        cls,
        *,
        model: str,
        system_prompt: str,
        title: str = 'New conversation',
        now: datetime | None = None,
    ) -> 'Conversation':
        now = now or datetime.now(timezone.utc)
        return cls(
            id=uuid.uuid4().hex,
            title=title,
            model=model,
            system_prompt=system_prompt,
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
            messages=[],
        )

    def add_message(self, message: Message) -> None:
        self.messages.append(message)
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def has_user_message(self) -> bool:
        return any(m.role == 'user' for m in self.messages)

    def ollama_messages(self) -> list[dict[str, Any]]:
        """Return the full message list for the chat API, system prompt first."""
        out: list[dict[str, Any]] = [{'role': 'system', 'content': self.system_prompt}]
        out.extend(m.to_ollama() for m in self.messages)
        return out

    def to_dict(self) -> dict[str, Any]:
        return {
            'id': self.id,
            'title': self.title,
            'model': self.model,
            'system_prompt': self.system_prompt,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'messages': [m.to_dict() for m in self.messages],
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> 'Conversation':
        return cls(
            id=d['id'],
            title=d.get('title', ''),
            model=d.get('model', ''),
            system_prompt=d.get('system_prompt', ''),
            created_at=d.get('created_at', ''),
            updated_at=d.get('updated_at', ''),
            messages=[Message.from_dict(m) for m in d.get('messages', [])],
        )
