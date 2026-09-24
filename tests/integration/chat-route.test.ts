import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NextRequest } from 'next/server'
import type { ChatClient } from '@/lib/types'
import { fakeChatClient, chunk, toolCall } from '../helpers'

const state = vi.hoisted(() => ({ dir: '', fakeClient: null as ChatClient | null }))

vi.mock('@/lib/ollama', () => ({ getOllamaClient: () => state.fakeClient }))
vi.mock('@/lib/conversations', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/conversations')>()
  return { ...mod, getStore: () => new mod.ConversationStore(state.dir) }
})

import { POST } from '@/app/api/chat/route'
import type { AgentEvent } from '@/lib/agent'

beforeAll(async () => {
  state.dir = await mkdtemp(join(tmpdir(), 'chat-route-'))
})

afterAll(async () => {
  await rm(state.dir, { recursive: true, force: true })
})

function request(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

async function postChat(body: unknown): Promise<AgentEvent[]> {
  const response = await POST(request(body))
  expect(response.headers.get('Content-Type')).toContain('application/x-ndjson')
  const text = await response.text()
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as AgentEvent)
}

describe('chat route', () => {
  it('streams thinking, tokens and a final done event over NDJSON', async () => {
    state.fakeClient = fakeChatClient([
      [chunk({ thinking: 'thinking now' }), chunk({ content: 'Hello' })],
    ])

    const events = await postChat({
      conversationId: 'conv-1',
      model: 'gpt-oss:120b',
      systemPrompt: 'you are a bot',
      think: 'auto',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(events.map((e) => e.type)).toEqual(['thinking', 'token', 'done'])
    const done = events.find((e): e is Extract<AgentEvent, { type: 'done' }> => e.type === 'done')!
    expect(done.messages).toHaveLength(2)
    expect(done.messages[1]).toMatchObject({ role: 'assistant', content: 'Hello', thinking: 'thinking now' })
  })

  it('streams tool calls and tool results and persists the conversation', async () => {
    state.fakeClient = fakeChatClient([
      [chunk({ thinking: 'need the date', tool_calls: [toolCall('get_current_datetime', {})] })],
      [chunk({ content: 'It is today.' })],
    ])

    const conversationId = 'conv-tools'
    const events = await postChat({
      conversationId,
      model: 'gpt-oss:120b',
      systemPrompt: 'sys',
      think: 'off',
      messages: [{ role: 'user', content: 'what is the date?' }],
    })

    expect(events.map((e) => e.type)).toEqual([
      'thinking',
      'tool_call',
      'tool_result',
      'token',
      'done',
    ])

    const saved = JSON.parse(
      await readFile(join(state.dir, 'conversations', `${conversationId}.json`), 'utf-8'),
    )
    expect(saved.system_prompt).toBe('sys')
    expect(saved.messages.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ])
  })

  it('defaults the system prompt when none is provided', async () => {
    state.fakeClient = fakeChatClient([[chunk({ content: 'ok' })]])
    const events = await postChat({
      conversationId: 'conv-default',
      model: 'gpt-oss:120b',
      systemPrompt: '',
      think: 'off',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(events.some((e) => e.type === 'done')).toBe(true)
    const saved = JSON.parse(
      await readFile(join(state.dir, 'conversations', 'conv-default.json'), 'utf-8'),
    )
    expect(saved.system_prompt).toContain('gpt-oss:120b')
    expect(saved.system_prompt).toContain('web_search')
  })

  it('surfaces a model error as an error event rather than throwing', async () => {
    state.fakeClient = {
      ...fakeChatClient([]),
      chat: async () => {
        throw new Error('model exploded')
      },
    }

    const events = await postChat({
      conversationId: 'conv-error',
      model: 'gpt-oss:120b',
      systemPrompt: '',
      think: 'off',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })
})
