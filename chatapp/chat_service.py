"""Streaming chat orchestration with a multi-round tool-calling loop.

``stream_chat`` is a generator that yields UI events so the Streamlit layer (or
any other front end) can render tokens, thinking and tool calls as they arrive.
"""

from __future__ import annotations

from typing import Any, Callable, Iterator

from chatapp.conversation import Conversation, Message, ToolCall

DEFAULT_MAX_TOOL_ROUNDS = 8


def stream_chat(
    *,
    client: Any,
    conversation: Conversation,
    model: str,
    tools: list[dict[str, Any]],
    executors: dict[str, Callable[..., str]],
    think: Any = None,
    max_tool_rounds: int = DEFAULT_MAX_TOOL_ROUNDS,
) -> Iterator[dict[str, Any]]:
    """Stream one user turn to completion, running tool calls as the model asks.

    Yields events with a ``type`` key: ``thinking_delta``, ``content_delta``,
    ``tool_call``, ``tool_result``, ``assistant_message``, ``done`` and
    ``error``. The ``conversation`` is mutated in place (assistant and tool
    messages appended) so the caller can persist it afterwards.
    """
    working: list[dict[str, Any]] = conversation.ollama_messages()

    for _ in range(max_tool_rounds):
        acc_content = ''
        acc_thinking = ''
        acc_tool_calls: list[ToolCall] = []
        stats: dict[str, Any] = {}

        try:
            stream = client.chat(
                model=model,
                messages=working,
                tools=tools,
                stream=True,
                think=think,
            )
        except Exception as exc:  # noqa: BLE001 - surface any transport error to the UI
            yield {'type': 'error', 'message': str(exc)}
            return

        for chunk in stream:
            message = chunk.message
            if message.thinking:
                acc_thinking += message.thinking
                yield {'type': 'thinking_delta', 'text': message.thinking}
            if message.content:
                acc_content += message.content
                yield {'type': 'content_delta', 'text': message.content}
            if message.tool_calls:
                for tc in message.tool_calls:
                    call = ToolCall(
                        name=tc.function.name,
                        arguments=dict(tc.function.arguments or {}),
                    )
                    if call not in acc_tool_calls:
                        acc_tool_calls.append(call)
                        yield {
                            'type': 'tool_call',
                            'name': call.name,
                            'arguments': call.arguments,
                        }
            if chunk.done:
                stats = {
                    'prompt_eval_count': chunk.prompt_eval_count,
                    'eval_count': chunk.eval_count,
                    'total_duration': chunk.total_duration,
                    'done_reason': chunk.done_reason,
                }

        assistant = Message(
            role='assistant',
            content=acc_content,
            thinking=acc_thinking,
            tool_calls=acc_tool_calls,
        )
        conversation.add_message(assistant)
        working.append(assistant.to_ollama())
        yield {'type': 'assistant_message', 'message': assistant, 'stats': stats}

        if not acc_tool_calls:
            yield {'type': 'done', 'stats': stats}
            return

        for call in acc_tool_calls:
            fn = executors.get(call.name)
            if fn is None:
                result = f"Error: unknown tool '{call.name}'"
            else:
                try:
                    result = fn(**call.arguments)
                except Exception as exc:  # noqa: BLE001 - a failing tool must not kill the turn
                    result = f"Error from tool '{call.name}': {exc}"

            tool_message = Message(role='tool', content=result, tool_name=call.name)
            conversation.add_message(tool_message)
            working.append(tool_message.to_ollama())
            yield {'type': 'tool_result', 'name': call.name, 'content': result}

    yield {
        'type': 'error',
        'message': f'Reached maximum of {max_tool_rounds} tool-calling rounds.',
    }
