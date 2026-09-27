import { mkdtemp } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { ChatRequest, Message } from 'ollama'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST as chat } from '@/app/api/chat/route'
import type { OllamaLike } from '@/lib/ollama'
import { ConversationStore } from '@/lib/storage'
import type { StreamEvent } from '@/types'

// The chat route builds its client via getOllamaClient(); replace it with a
// scripted fake so the whole HTTP route + tool loop runs without network.
const holder = vi.hoisted(() => ({ client: null as OllamaLike | null }))
vi.mock('@/lib/ollama', () => ({
  getOllamaClient: () => holder.client,
}))

interface Chunk {
  message: Message
  done: boolean
  prompt_eval_count?: number
  eval_count?: number
}

/** Fake client whose each chat() call consumes the next scripted round. */
class FakeClient implements OllamaLike {
  requests: ChatRequest[] = []
  private round = 0

  constructor(private rounds: Chunk[][]) {}

  chat = async (request: ChatRequest & { stream: true }) => {
    this.requests.push(request)
    const chunks = this.rounds[this.round] ?? []
    this.round += 1
    return (async function* (): AsyncGenerator<Chunk> {
      for (const chunk of chunks) yield chunk
    })()
  }

  webSearch = async () => ({ results: [{ content: 'live search result' }] })
  webFetch = async () => ({ title: 'T', url: 'https://u', content: 'C', links: [] })
}

function chunk(message: Partial<Message>, done = false, usage?: [number, number]): Chunk {
  return {
    message: { role: 'assistant', content: '', ...message },
    done,
    prompt_eval_count: usage?.[0],
    eval_count: usage?.[1],
  }
}

let dataDir: string
let store: ConversationStore

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'bigcode-chat-'))
  process.env.DATA_DIR = dataDir
  process.env.OLLAMA_MODEL = 'test-model:cloud'
  process.env.OLLAMA_CONTEXT_WINDOW = '4096'
  store = new ConversationStore(dataDir)
  await store.init()
})

async function createConversation(): Promise<string> {
  const conversation = await store.create({ model: 'test-model:cloud', systemPrompt: 'Be brief.' })
  return conversation.id
}

async function runChat(body: Record<string, unknown>): Promise<{ response: Response; events: StreamEvent[] }> {
  const response = await chat(
    new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  const events: StreamEvent[] = []
  for (const line of (await response.text()).split('\n')) {
    if (line.trim()) events.push(JSON.parse(line))
  }
  return { response, events }
}

describe('POST /api/chat', () => {
  it('validates the request body', async () => {
    const missing = await chat(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'hi' }),
      }),
    )
    expect(missing.status).toBe(400)

    const unknown = await runChat({ conversationId: 'a'.repeat(32), content: 'hi' })
    expect(unknown.response.status).toBe(404)
  })

  it('streams content, persists the turn, and retitles the conversation', async () => {
    holder.client = new FakeClient([[chunk({ content: 'Hello ' }, false), chunk({ content: 'there!' }, true, [12, 3])]])
    const id = await createConversation()

    const { response, events } = await runChat({
      conversationId: id,
      content: 'Say hi',
      think: false,
      tools: false,
    })

    expect(response.headers.get('Content-Type')).toContain('application/x-ndjson')
    expect(events).toEqual([
      { type: 'round_start', round: 0 },
      { type: 'content', content: 'Hello ' },
      { type: 'content', content: 'there!' },
      { type: 'assistant', message: { role: 'assistant', content: 'Hello there!' } },
      { type: 'usage', prompt_tokens: 12, response_tokens: 3 },
      expect.objectContaining({ type: 'done' }),
    ])

    const persisted = await store.get(id)
    expect(persisted?.messages).toEqual([
      { role: 'user', content: 'Say hi' },
      { role: 'assistant', content: 'Hello there!' },
    ])
    expect(persisted?.title).toBe('Say hi')
  })

  it('runs the full tool loop with the built-in web tools', async () => {
    holder.client = new FakeClient([
      [
        chunk(
          {
            thinking: 'I should search.',
            tool_calls: [
              { function: { name: 'web_search', arguments: { query: 'ollama' } } },
            ],
          },
          true,
        ),
      ],
      [chunk({ content: 'Found it.' }, true, [30, 6])],
    ])
    const id = await createConversation()

    const { events } = await runChat({ conversationId: id, content: 'search ollama', think: true, tools: true })

    const types = events.map((event) => event.type)
    expect(types).toEqual([
      'round_start',
      'thinking',
      'assistant',
      'tool_calls',
      'tool_result',
      'round_start',
      'content',
      'assistant',
      'usage',
      'done',
    ])

    const toolResult = events.find((event) => event.type === 'tool_result') as { content: string }
    expect(JSON.parse(toolResult.content)).toEqual({ results: [{ content: 'live search result' }] })

    const persisted = await store.get(id)
    expect(persisted?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ])
    expect(persisted?.messages[1].thinking).toBe('I should search.')
    expect(persisted?.messages[2].tool_name).toBe('web_search')
  })

  it('persists the user message and surfaces an error when the provider fails', async () => {
    holder.client = {
      chat: (async () => {
        throw new Error('invalid api key')
      }) as OllamaLike['chat'],
      webSearch: async () => ({ results: [] }),
      webFetch: async () => ({ title: '', url: '', content: '', links: [] }),
    }
    const id = await createConversation()

    const { events } = await runChat({ conversationId: id, content: 'hello?', think: false, tools: false })

    expect(events.at(-1)).toEqual({ type: 'error', message: 'invalid api key' })
    const persisted = await store.get(id)
    expect(persisted?.messages).toEqual([{ role: 'user', content: 'hello?' }])
  })

  it('sends the stored system prompt and history to the model', async () => {
    holder.client = new FakeClient([[chunk({ content: 'ok' }, true)]])
    const id = await createConversation()
    await store.appendMessages(id, [
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
    ])

    await runChat({ conversationId: id, content: 'second question', think: false, tools: false })

    const client = holder.client as unknown as FakeClient
    const sent = client.requests[0].messages as Message[]
    expect(sent.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(sent[0].content).toBe('Be brief.')
    expect(sent.at(-1)?.content).toBe('second question')
  })
})