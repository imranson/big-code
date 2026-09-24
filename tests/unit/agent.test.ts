import { describe, it, expect } from 'vitest'
import { runAgent, toThinkValue, type AgentEvent } from '@/lib/agent'
import { fakeChatClient, chunk, collectEvents, toolCall } from '../helpers'
import type { ChatMessage } from '@/lib/types'

const NOW = new Date('2026-09-24T10:30:00Z')

describe('toThinkValue', () => {
  it('maps off/undefined to undefined', () => {
    expect(toThinkValue('off')).toBeUndefined()
    expect(toThinkValue(undefined)).toBeUndefined()
  })
  it('maps auto to true', () => {
    expect(toThinkValue('auto')).toBe(true)
  })
  it('passes through low/medium/high', () => {
    expect(toThinkValue('low')).toBe('low')
    expect(toThinkValue('medium')).toBe('medium')
    expect(toThinkValue('high')).toBe('high')
  })
})

describe('runAgent', () => {
  it('streams thinking and content tokens and yields the final messages', async () => {
    const client = fakeChatClient([
      [chunk({ thinking: 'hmm' }), chunk({ content: 'Hello' })],
    ])
    const events = await collectEvents(
      runAgent({ client, model: 'm', messages: [{ role: 'user', content: 'hi' }] }),
    )

    expect(events.map((e) => e.type)).toEqual(['thinking', 'token', 'done'])

    const done = events.find((e): e is Extract<AgentEvent, { type: 'done' }> => e.type === 'done')!
    expect(done.messages).toHaveLength(2)
    expect(done.messages[1]).toMatchObject({ role: 'assistant', content: 'Hello', thinking: 'hmm' })
  })

  it('prepends the system message but omits it from the result', async () => {
    const client = fakeChatClient([[chunk({ content: 'ok' })]])
    const events = await collectEvents(
      runAgent({
        client,
        model: 'm',
        messages: [{ role: 'user', content: 'hi' }],
        system: 'you are a bot',
      }),
    )
    const done = events.find((e): e is Extract<AgentEvent, { type: 'done' }> => e.type === 'done')!
    expect(done.messages.every((m) => m.role !== 'system')).toBe(true)
    expect(done.messages).toHaveLength(2)
  })

  it('runs a tool loop: emits tool_call, tool_result, then the final answer', async () => {
    const client = fakeChatClient([
      [
        chunk({ thinking: 'searching', tool_calls: [toolCall('get_current_datetime', {})] }),
      ],
      [chunk({ content: 'Today is 2026-09-24' })],
    ])
    const events = await collectEvents(
      runAgent({
        client,
        model: 'm',
        messages: [{ role: 'user', content: 'what is the date?' }],
        now: () => NOW,
      }),
    )

    expect(events.map((e) => e.type)).toEqual([
      'thinking',
      'tool_call',
      'tool_result',
      'token',
      'done',
    ])

    const toolResult = events.find((e): e is Extract<AgentEvent, { type: 'tool_result' }> => e.type === 'tool_result')!
    expect(toolResult.name).toBe('get_current_datetime')
    expect(toolResult.content).toBe(NOW.toISOString())

    const done = events.find((e): e is Extract<AgentEvent, { type: 'done' }> => e.type === 'done')!
    expect(done.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(done.messages[1]).toHaveProperty('tool_calls')
  })

  it('wraps unknown-tool errors as a tool_result instead of throwing', async () => {
    const client = fakeChatClient([
      [chunk({ tool_calls: [toolCall('does_not_exist', {})] })],
      [chunk({ content: 'fallback' })],
    ])
    const events = await collectEvents(
      runAgent({ client, model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    )
    const result = events.find((e): e is Extract<AgentEvent, { type: 'tool_result' }> => e.type === 'tool_result')!
    expect(JSON.parse(result.content)).toEqual({ error: 'Unknown tool: does_not_exist' })
  })

  it('emits an error event when the tool loop exceeds the iteration limit', async () => {
    const client = fakeChatClient([[chunk({ tool_calls: [toolCall('get_current_datetime', {})] })]])
    const events = await collectEvents(
      runAgent({
        client,
        model: 'm',
        messages: [{ role: 'user', content: 'x' }],
        maxIterations: 1,
        now: () => NOW,
      }),
    )
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })

  it('passes the think level through to the chat request', async () => {
    const client = fakeChatClient([[chunk({ content: 'ok' })]])
    const chatSpy = { called: false as boolean, think: undefined as unknown }
    const originalChat = client.chat
    client.chat = async (req) => {
      chatSpy.called = true
      chatSpy.think = (req as { think?: unknown }).think
      return originalChat(req)
    }
    await collectEvents(
      runAgent({ client, model: 'm', messages: [{ role: 'user', content: 'x' }], think: 'high' }),
    )
    expect(chatSpy.called).toBe(true)
    expect(chatSpy.think).toBe('high')
  })

  it('does not append an empty assistant message when the model returns nothing', async () => {
    const client = fakeChatClient([[]])
    const events = await collectEvents(
      runAgent({ client, model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    )
    const done = events.find((e): e is Extract<AgentEvent, { type: 'done' }> => e.type === 'done')!
    expect(done.messages).toHaveLength(1) // only the user message
  })
})
