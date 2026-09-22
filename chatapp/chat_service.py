from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from . import tools as tools_mod
from .context_window import context_length_for


@dataclass
class ChatResult:
  messages: list[dict] = field(default_factory=list)  # stored history (system prompt stripped)
  content: str = ''  # final assistant content
  thinking: str = ''  # final assistant thinking (empty if none)
  tool_calls_made: list[dict] = field(default_factory=list)  # trace of executed tools


def _as_dict(message: Any) -> dict:
  if hasattr(message, 'model_dump'):
    return message.model_dump(exclude_none=True)
  if isinstance(message, dict):
    return message
  return {'role': 'assistant', 'content': str(message)}


class ChatService:
  """Runs the multi-turn chat + tool-calling loop against an Ollama client."""

  def __init__(self, client: Any, max_iterations: int = 10):
    self.client = client
    self.max_iterations = max_iterations

  def run(
    self,
    *,
    model: str,
    user_input: str,
    history: list[dict] | None = None,
    system_prompt: str | None = None,
    think: bool = False,
    enabled_tools: set[str] | None = None,
    num_ctx: int | None = None,
  ) -> ChatResult:
    history = list(history or [])
    enabled_tools = set(enabled_tools or ())

    messages: list[dict] = []
    if system_prompt:
      messages.append({'role': 'system', 'content': system_prompt})
    messages.extend(history)
    messages.append({'role': 'user', 'content': user_input})

    tool_schemas = tools_mod.build_tools(enabled_tools) or None
    options = {'num_ctx': context_length_for(model, num_ctx)}

    tool_calls_made: list[dict] = []
    final_content = ''
    final_thinking = ''

    for _ in range(self.max_iterations):
      response = self.client.chat(
        model=model,
        messages=messages,
        tools=tool_schemas,
        think=think,
        options=options,
      )
      msg = _as_dict(response.message)
      messages.append(msg)

      if msg.get('thinking'):
        final_thinking = msg['thinking']

      tool_calls = msg.get('tool_calls') or []
      if not tool_calls:
        final_content = msg.get('content') or ''
        break

      for call in tool_calls:
        fn = call.get('function', call)
        name = fn.get('name', '')
        args = fn.get('arguments') or {}
        result_str = tools_mod.run_tool(self.client, name, args)
        tool_calls_made.append({'name': name, 'arguments': dict(args)})
        messages.append({'role': 'tool', 'content': result_str, 'tool_name': name})
    else:
      final_content = final_content or '(reached maximum tool iterations without a final answer)'

    stored = [m for m in messages if m.get('role') != 'system']
    return ChatResult(
      messages=stored,
      content=final_content,
      thinking=final_thinking,
      tool_calls_made=tool_calls_made,
    )
