from __future__ import annotations

from typing import Any

CHARS_PER_TOKEN = 4
DEFAULT_CONTEXT = 32768

# Rough context lengths (tokens) for known cloud models. Fallback is DEFAULT_CONTEXT.
MODEL_CONTEXT = {
  'gpt-oss:120b-cloud': 131072,
  'kimi-k2.6:cloud': 131072,
}


def estimate_tokens(text: str | None) -> int:
  """Rough token estimate: ~4 characters per token."""
  if not text:
    return 0
  return (len(text) + CHARS_PER_TOKEN - 1) // CHARS_PER_TOKEN


def message_tokens(message: dict[str, Any]) -> int:
  parts = [str(message.get('role', ''))]
  for key in ('content', 'thinking'):
    parts.append(str(message.get(key) or ''))
  tool_calls = message.get('tool_calls')
  if tool_calls:
    parts.append(str(tool_calls))
  return estimate_tokens(''.join(parts))


def conversation_tokens(messages: list[dict], system_prompt: str | None = None) -> int:
  total = estimate_tokens(system_prompt)
  for message in messages:
    total += message_tokens(message)
  return total


def context_length_for(model: str, num_ctx: int | None = None) -> int:
  if num_ctx:
    return num_ctx
  return MODEL_CONTEXT.get(model, DEFAULT_CONTEXT)


def context_usage(used_tokens: int, context_length: int) -> dict[str, Any]:
  total = max(context_length, 1)
  fraction = min(1.0, max(0.0, used_tokens / total))
  return {
    'used_tokens': used_tokens,
    'context_length': total,
    'fraction': fraction,
    'percent': round(fraction * 100),
  }
