"""Rough context-window usage estimation (characters-per-token heuristic)."""

from __future__ import annotations

import json
from dataclasses import dataclass

from chatapp.conversation import Conversation, Message

CHARS_PER_TOKEN = 4
DEFAULT_CONTEXT_WINDOW = 131_072


@dataclass
class ContextUsage:
    estimated_tokens: int
    context_window: int
    last_prompt_tokens: int | None = None
    last_eval_tokens: int | None = None

    @property
    def percent_used(self) -> float:
        if self.context_window <= 0:
            return 0.0
        return min(100.0, 100.0 * self.estimated_tokens / self.context_window)

    @property
    def remaining_tokens(self) -> int:
        return max(0, self.context_window - self.estimated_tokens)


def estimate_tokens(text: str, chars_per_token: int = CHARS_PER_TOKEN) -> int:
    if not text:
        return 0
    if chars_per_token <= 0:
        chars_per_token = CHARS_PER_TOKEN
    return max(1, round(len(text) / chars_per_token))


def estimate_message_tokens(message: Message) -> int:
    total = estimate_tokens(message.content) + estimate_tokens(message.thinking)
    if message.tool_name:
        total += estimate_tokens(message.tool_name)
    for tc in message.tool_calls:
        total += estimate_tokens(tc.name) + estimate_tokens(json.dumps(tc.arguments))
    return total


def estimate_conversation_tokens(conversation: Conversation) -> int:
    total = estimate_tokens(conversation.system_prompt)
    for message in conversation.messages:
        total += estimate_message_tokens(message)
    return total


def build_usage(
    conversation: Conversation,
    context_window: int = DEFAULT_CONTEXT_WINDOW,
    last_prompt_tokens: int | None = None,
    last_eval_tokens: int | None = None,
) -> ContextUsage:
    return ContextUsage(
        estimated_tokens=estimate_conversation_tokens(conversation),
        context_window=context_window,
        last_prompt_tokens=last_prompt_tokens,
        last_eval_tokens=last_eval_tokens,
    )
