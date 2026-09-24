// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ChatApp from '@/components/ChatApp'
import { Composer } from '@/components/Composer'
import { MessageItem } from '@/components/MessageItem'
import { ContextIndicator } from '@/components/ContextIndicator'
import type { Conversation } from '@/lib/types'

function ndjsonResponse(lines: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ContextIndicator', () => {
  it('renders the estimated percentage', () => {
    render(<ContextIndicator usage={{ used: 100, total: 1000, percent: 10 }} />)
    expect(screen.getByText('Context ~10%')).toBeInTheDocument()
  })
})

describe('MessageItem', () => {
  it('renders user and assistant messages', () => {
    const { rerender } = render(<MessageItem node={{ kind: 'user', content: 'hello' }} />)
    expect(screen.getByText('hello')).toBeInTheDocument()

    rerender(<MessageItem node={{ kind: 'assistant', content: 'world', thinking: '', streaming: false }} />)
    expect(screen.getByText('world')).toBeInTheDocument()
  })

  it('renders thinking and tool-call nodes', () => {
    render(<MessageItem node={{ kind: 'assistant', content: '', thinking: 'reasoning…', streaming: false }} />)
    expect(screen.getByText('reasoning…')).toBeInTheDocument()

    render(<MessageItem node={{ kind: 'tool-call', name: 'web_search', arguments: { query: 'x' }, pending: true }} />)
    expect(screen.getAllByText('web_search').length).toBeGreaterThan(0)
  })
})

describe('Composer', () => {
  const baseProps = {
    think: 'off' as const,
    onThinkChange: vi.fn(),
    model: 'gpt-oss:120b',
    onModelChange: vi.fn(),
    systemPrompt: 'sys',
    onSystemPromptChange: vi.fn(),
    contextUsage: { used: 0, total: 128000, percent: 0 },
    onSend: vi.fn(),
  }

  it('has a thinking selector and is disabled when empty', () => {
    render(<Composer {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByText('Thinking')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('calls onSend with the trimmed text', () => {
    render(<Composer {...baseProps} />)
    fireEvent.change(screen.getByPlaceholderText(/Type a message/), { target: { value: ' hi ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(baseProps.onSend).toHaveBeenCalledWith('hi')
  })
})

describe('ChatApp streaming', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a conversation and streams an assistant reply', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/config') return jsonResponse({ model: 'gpt-oss:120b', contextWindow: 128000 })
      if (url === '/api/conversations?archived=true') return jsonResponse({ conversations: [] })
      if (url === '/api/conversations') {
        const conversation: Conversation = {
          id: 'c1',
          title: 'New conversation',
          model: 'gpt-oss:120b',
          system_prompt: 'sys',
          created_at: '2026-09-24T00:00:00.000Z',
          updated_at: '2026-09-24T00:00:00.000Z',
          messages: [],
        }
        return jsonResponse({ conversation }, 201)
      }
      if (url === '/api/chat') {
        return ndjsonResponse([
          JSON.stringify({ type: 'token', delta: 'Hello' }),
          JSON.stringify({
            type: 'done',
            messages: [
              { role: 'user', content: 'hi' },
              { role: 'assistant', content: 'Hello' },
            ],
          }),
        ])
      }
      return jsonResponse({ conversations: [] })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ChatApp />)

    await waitFor(() => expect(screen.getByText('Start a conversation')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText(/Type a message/), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Hello')).toBeInTheDocument()
  })
})
