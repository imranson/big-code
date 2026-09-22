"""Shared pytest fixtures and helpers."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def make_chunk(
    content: str | None = None,
    thinking: str | None = None,
    tool_calls: list | None = None,
    *,
    done: bool = False,
    prompt_eval_count: int | None = None,
    eval_count: int | None = None,
    total_duration: int | None = None,
    done_reason: str | None = None,
) -> SimpleNamespace:
    """Build a chunk that mimics ``ollama.ChatResponse`` closely enough for tests."""
    message = SimpleNamespace(content=content, thinking=thinking, tool_calls=tool_calls)
    return SimpleNamespace(
        message=message,
        done=done,
        prompt_eval_count=prompt_eval_count,
        eval_count=eval_count,
        total_duration=total_duration,
        done_reason=done_reason,
    )


def make_tool_call(name: str, arguments: dict) -> SimpleNamespace:
    return SimpleNamespace(function=SimpleNamespace(name=name, arguments=arguments))


@pytest.fixture
def tmp_data_dir(tmp_path: Path) -> Path:
    return tmp_path / 'data'


@pytest.fixture
def fake_api_key() -> str:
    return 'test-api-key-123'
