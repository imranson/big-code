import type { ChatRequest, Message } from 'ollama'

import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_MAX_TOOL_ROUNDS, mergeStreamedToolCalls, streamChat, type ChatStreamDeps } from '@/lib/chat-service'
import type { OllamaLike } from '@/lib/ollama'
import type { ChatMessage, StreamEvent, ToolCall } from '@/types'

interface Chunk {
  message: Message
  done: boolean
  prompt_eval_count?: number
  eval_count?: number
}

/** Scripted fake Ollama client: each `chat` call consumes the next round. */
class FakeClient implements OllamaLike {
  requests: ChatRequest[] = []
  private round = 0

  constructor(
    private rounds: Chunk[][],
    private hooks: { onChunk?: (round: number) => void } = {},
  ) {}

  chat = async (request: ChatRequest & { stream: true }) => {
    this.requests.push(request)
    const chunks = this.rounds[this.round] ?? []
    const round = this.round
    this.round += 1
    const hooks = this.hooks
    return (async function* (): AsyncGenerator<Chunk> {
      for (const chunk of chunks) {
        yield chunk
        hooks.onChunk?.(round)
      }
    })()
  }

  webSearch = vi.fn(async () => ({ results: [{ content: 'search result' }] }))
  webFetch = vi.fn(async () => ({ title: 'T', url: 'u', content: 'c', links: [] }))
}

function chunk(
  message: Partial<Omit<Message, 'tool_calls'>> & { tool_calls?: unknown[] },
  done = false,
  usage?: [number, number],
): Chunk {
  return {
    message: { role: 'assistant', content: '', ...message } as Message,
    done,
    prompt_eval_count: usage?.[0],
    eval_count: usage?.[1],
  }
}

const toolCall = (name: string, args: Record<string, unknown>): ToolCall => ({
  function: { name, arguments: args },
})

async function collect(
  deps: ChatStreamDeps,
  options: Parameters<typeof streamChat>[1],
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = []
  for await (const event of streamChat(deps, options)) events.push(event)
  return events
}

const baseOptions = {
  model: 'test-model',
  systemPrompt: 'Be brief.',
  messages: [{ role: 'user', content: 'hi' }] as ChatMessage[],
  think: false,
  tools: false,
}

describe('mergeStreamedToolCalls', () => {
  it('merges name/argument fragments by index and keeps ids', () => {
    const merged = mergeStreamedToolCalls(
      [{ id: 'a:0', function: { index: 0, name: 'web_', arguments: {} } }],
      [{ id: 'a:0', function: { index: 0, name: 'search', arguments: { query: 'q' } } }],
    )
    expect(merged).toEqual([{ id: 'a:0', function: { index: 0, name: 'web_search', arguments: { query: 'q' } } }])
  })

  it('appends calls at new indexes and merges argument objects', () => {
    const merged = mergeStreamedToolCalls(
      [{ function: { index: 0, name: 'web_search', arguments: { query: 'a' } } }],
      [{ function: { index: 1, name: 'web_fetch', arguments: { url: 'u' } } }],
    )
    expect(merged.map((call) => call.function.name)).toEqual(['web_search', 'web_fetch'])
    expect(merged[0].function.arguments).toEqual({ query: 'a' })
  })

  it('ignores repeated empty argument fragments', () => {
    const merged = mergeStreamedToolCalls(
      [{ function: { index: 0, name: 'web_search', arguments: { query: 'keep' } } }],
      [{ function: { index: 0, name: 'web_search', arguments: {} } }],
    )
    expect(merged[0].function.arguments).toEqual({ query: 'keep' })
  })
})

describe('streamChat: request construction', () => {
  it('prepends the system prompt and only sends enabled options', async () => {
    const client = new FakeClient([[chunk({ content: 'ok' }, true, [3, 2])]])
    await collect({ client }, baseOptions)
    expect(client.requests[0].messages?.[0]).toEqual({ role: 'system', content: 'Be brief.' })
    expect(client.requests[0].messages?.[1]).toEqual({ role: 'user', content: 'hi' })
    expect(client.requests[0].think).toBeUndefined()
    expect(client.requests[0].tools).toBeUndefined()
    expect(client.requests[0].stream).toBe(true)
    expect(client.requests[0].model).toBe('test-model')
  })

  it('sends think and tools when enabled', async () => {
    const client = new FakeClient([[chunk({ content: 'ok' }, true)]])
    await collect({ client }, { ...baseOptions, think: true, tools: true })
    expect(client.requests[0].think).toBe(true)
    expect(client.requests[0].tools?.length).toBe(3)
  })
})

describe('streamChat: plain responses', () => {
  it('streams content deltas and emits the final assistant message and usage', async () => {
    const client = new FakeClient([
      [chunk({ content: 'Hel' }), chunk({ content: 'lo!' }, true, [10, 2])],
    ])
    const events = await collect({ client }, baseOptions)

    expect(events).toEqual([
      { type: 'round_start', round: 0 },
      { type: 'content', content: 'Hel' },
      { type: 'content', content: 'lo!' },
      { type: 'assistant', message: { role: 'assistant', content: 'Hello!' } },
      { type: 'usage', prompt_tokens: 10, response_tokens: 2 },
    ])
  })

  it('streams thinking deltas and keeps them on the assistant message', async () => {
    const client = new FakeClient([
      [chunk({ thinking: 'hmm ' }), chunk({ thinking: '…' }), chunk({ content: 'Answer' }, true)],
    ])
    const events = await collect({ client }, { ...baseOptions, think: true })

    const thinking = events.filter((event) => event.type === 'thinking')
    expect(thinking.map((event) => (event as { content: string }).content)).toEqual(['hmm ', '…'])
    const assistant = events.find((event) => event.type === 'assistant') as {
      message: ChatMessage
    }
    expect(assistant.message.thinking).toBe('hmm …')
    expect(assistant.message.content).toBe('Answer')
  })
})

describe('streamChat: tool rounds', () => {
  it('executes tool calls and feeds results back for a second round', async () => {
    const client = new FakeClient([
      [chunk({ tool_calls: [toolCall('web_search', { query: 'q' })] }, true)],
      [chunk({ content: 'Searched!' }, true, [20, 5])],
    ])
    const executeTool = vi.fn(async () => '{"results":[]}')
    const events = await collect({ client, executeTool }, { ...baseOptions, tools: true })

    expect(executeTool).toHaveBeenCalledWith('web_search', { query: 'q' })
    expect(events).toEqual([
      { type: 'round_start', round: 0 },
      { type: 'assistant', message: { role: 'assistant', content: '', tool_calls: [toolCall('web_search', { query: 'q' })] } },
      { type: 'tool_calls', tool_calls: [toolCall('web_search', { query: 'q' })] },
      { type: 'tool_result', tool_name: 'web_search', content: '{"results":[]}' },
      { type: 'round_start', round: 1 },
      { type: 'content', content: 'Searched!' },
      { type: 'assistant', message: { role: 'assistant', content: 'Searched!' } },
      { type: 'usage', prompt_tokens: 20, response_tokens: 5 },
    ])

    // Second request contains the tool-call message and the tool result.
    const second = client.requests[1].messages as Message[]
    expect(second[second.length - 2].tool_calls).toBeDefined()
    expect(second[second.length - 1]).toEqual({
      role: 'tool',
      content: '{"results":[]}',
      tool_name: 'web_search',
    })
  })

  it('uses the built-in web tool executor by default', async () => {
    const client = new FakeClient([
      [chunk({ tool_calls: [toolCall('web_search', { query: 'cats' })] }, true)],
      [chunk({ content: 'done' }, true)],
    ])
    const events = await collect({ client }, { ...baseOptions, tools: true })
    expect(client.webSearch).toHaveBeenCalledWith({ query: 'cats', maxResults: undefined })
    const result = events.find((event) => event.type === 'tool_result') as { content: string }
    expect(JSON.parse(result.content)).toEqual({ results: [{ content: 'search result' }] })
  })

  it('accumulates tool calls that arrive on non-final chunks (ollama.com behavior)', async () => {
    const client = new FakeClient([
      [
        chunk({ thinking: 'need the date' }),
        chunk({ tool_calls: [{ id: 'functions.get_current_datetime:0', function: { index: 0, name: 'get_current_datetime', arguments: {} } }] }),
        chunk({ content: '' }),
        chunk({ content: '' }, true, [8, 4]),
      ],
      [chunk({ content: 'It is September.' }, true)],
    ])
    const executeTool = vi.fn(async () => '2026-09-27T00:00:00.000Z')
    const events = await collect({ client, executeTool }, { ...baseOptions, tools: true })

    expect(executeTool).toHaveBeenCalledWith('get_current_datetime', {})
    const assistant = events.find((event) => event.type === 'assistant') as { message: ChatMessage }
    expect(assistant.message.tool_calls).toEqual([
      { id: 'functions.get_current_datetime:0', function: { index: 0, name: 'get_current_datetime', arguments: {} } },
    ])
    expect(events.some((event) => event.type === 'tool_result')).toBe(true)
    expect(events.at(-2)).toMatchObject({ type: 'assistant', message: { content: 'It is September.' } })
  })

  it('merges tool-call fragments streamed across chunks', async () => {
    const client = new FakeClient([
      [
        chunk({ tool_calls: [{ function: { index: 0, name: 'web_', arguments: {} } }] }),
        chunk({ tool_calls: [{ function: { index: 0, name: 'search', arguments: { query: 'frag' } } }] }),
        chunk({ tool_calls: [{ function: { index: 1, name: 'get_current_datetime', arguments: {} } }] }),
        chunk({ content: '' }, true),
      ],
      [chunk({ content: 'merged!' }, true)],
    ])
    const executeTool = vi.fn(async () => 'ok')
    const events = await collect({ client, executeTool }, { ...baseOptions, tools: true })

    expect(executeTool).toHaveBeenCalledTimes(2)
    expect(executeTool).toHaveBeenNthCalledWith(1, 'web_search', { query: 'frag' })
    expect(executeTool).toHaveBeenNthCalledWith(2, 'get_current_datetime', {})
    expect(events.some((event) => event.type === 'error')).toBe(false)
  })

  it('stops after the round limit and reports an error', async () => {
    const loopRound = [chunk({ tool_calls: [toolCall('web_search', {})] }, true)]
    const client = new FakeClient([
      loopRound,
      loopRound,
      loopRound,
      loopRound,
      loopRound,
      loopRound,
      loopRound,
      loopRound,
      loopRound,
    ])
    const executeTool = vi.fn(async () => '{}')
    const events = await collect(
      { client, executeTool },
      { ...baseOptions, tools: true, messages: [{ role: 'user', content: 'go' }] },
    )
    const errors = events.filter((event) => event.type === 'error')
    expect(errors).toEqual([
      { type: 'error', message: `Reached the maximum of ${DEFAULT_MAX_TOOL_ROUNDS} tool rounds for a single turn.` },
    ])
    // 8 tool rounds run, then one final chat that must produce an answer.
    expect(client.requests.length).toBe(DEFAULT_MAX_TOOL_ROUNDS + 1)
  })
})

describe('streamChat: failures and aborts', () => {
  it('emits partial output then an error when the stream throws', async () => {
    const client = {
      chat: async () =>
        (async function* (): AsyncGenerator<Chunk> {
          yield chunk({ content: 'partial' })
          throw new Error('connection reset')
        })(),
      webSearch: vi.fn(),
      webFetch: vi.fn(),
    }
    const events = await collect({ client }, baseOptions)

    expect(events).toEqual([
      { type: 'round_start', round: 0 },
      { type: 'content', content: 'partial' },
      { type: 'assistant', message: { role: 'assistant', content: 'partial' } },
      { type: 'error', message: 'connection reset' },
    ])
  })

  it('does not emit an empty assistant message when nothing streamed', async () => {
    const client = {
      chat: async () =>
        (async function* (): AsyncGenerator<Chunk> {
          throw new Error('401 unauthorized')
        })(),
      webSearch: vi.fn(),
      webFetch: vi.fn(),
    }
    const events = await collect({ client }, baseOptions)
    expect(events.some((event) => event.type === 'assistant')).toBe(false)
    expect(events.at(-1)).toEqual({ type: 'error', message: '401 unauthorized' })
  })

  it('stops before starting when the signal is already aborted', async () => {
    const client = new FakeClient([[chunk({ content: 'x' }, true)]])
    const controller = new AbortController()
    controller.abort()
    const events = await collect({ client, signal: controller.signal }, baseOptions)
    expect(events).toEqual([{ type: 'error', message: 'Request aborted.' }])
    expect(client.requests.length).toBe(0)
  })

  it('persists partial output when aborted mid-stream', async () => {
    const controller = new AbortController()
    const client = new FakeClient(
      [[chunk({ thinking: 't', content: 'part' }), chunk({ content: 'more' }, true)]],
      { onChunk: () => controller.abort() },
    )
    const events = await collect({ client, signal: controller.signal }, baseOptions)
    expect(events).toEqual([
      { type: 'round_start', round: 0 },
      { type: 'thinking', content: 't' },
      { type: 'content', content: 'part' },
      { type: 'assistant', message: { role: 'assistant', content: 'part', thinking: 't' } },
      { type: 'error', message: 'Request aborted.' },
    ])
  })
})