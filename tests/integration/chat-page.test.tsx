import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ChatView from '@/components/ChatView'
import type { Conversation, ConversationMeta, StreamEvent } from '@/types'

const ID = 'a'.repeat(32)

function meta(title: string, updatedAt: string): ConversationMeta {
  return {
    id: ID,
    title,
    model: 'test-model:cloud',
    system_prompt: 'Be brief.',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: updatedAt,
  }
}

function conversation(): Conversation {
  return {
    id: ID,
    title: 'Stored conversation',
    model: 'test-model:cloud',
    system_prompt: 'Be brief.',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-02T00:00:00Z',
    messages: [
      { role: 'user', content: 'stored question' },
      { role: 'assistant', content: 'stored **answer**' },
    ],
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ndjsonResponse(events: unknown[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

interface Route {
  method: string
  match: (url: string) => boolean
  respond: (request: { url: string; body: unknown }) => Response
}

const defaultRoutes: Route[] = [
  {
    method: 'GET',
    match: (url) => url === '/api/conversations',
    respond: () => jsonResponse({ conversations: [meta('Stored conversation', '2026-09-02T00:00:00Z')] }),
  },
  {
    method: 'GET',
    match: (url) => url === '/api/archive',
    respond: () => jsonResponse({ conversations: [] }),
  },
  {
    method: 'GET',
    match: (url) => url === `/api/conversations/${ID}`,
    respond: () => jsonResponse(conversation()),
  },
]

function stubFetch(routes: Route[]): void {
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    const route = routes.find((candidate) => candidate.method === method && candidate.match(href))
    if (!route) throw new Error(`No route: ${method} ${href}`)
    return route.respond({ url: href, body })
  })
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
}

beforeEach(() => {
  stubFetch(defaultRoutes)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderChat() {
  return render(<ChatView defaultModel="test-model:cloud" contextWindow={131072} />)
}

describe('ChatView integration', () => {
  it('loads history on mount and renders stored markdown', async () => {
    renderChat()

    expect(await screen.findByText('stored question')).toBeInTheDocument()
    expect(document.querySelector('.markdown strong')).toHaveTextContent('answer')
    expect(screen.getAllByText('Stored conversation').length).toBeGreaterThan(0)
    expect(screen.getByTestId('context-meter')).toHaveTextContent('%')
  })

  it('sends a message and renders the streamed turn (thinking, tools, markdown)', async () => {
    const chatEvents: StreamEvent[] = [
      { type: 'round_start', round: 0 },
      { type: 'thinking', content: 'Thinking about it…' },
      { type: 'content', content: 'Let me search. ' },
      {
        type: 'tool_calls',
        tool_calls: [{ function: { name: 'web_search', arguments: { query: 'test' } } }],
      },
      { type: 'tool_result', tool_name: 'web_search', content: '{"results":[]}' },
      { type: 'assistant', message: { role: 'assistant', content: 'final' } },
      {
        type: 'done',
        conversation: {
          ...conversation(),
          title: 'Hello app',
          messages: [
            { role: 'user', content: 'Hello app' },
            {
              role: 'assistant',
              content: 'Let me search. ',
              thinking: 'Thinking about it…',
              tool_calls: [{ function: { name: 'web_search', arguments: { query: 'test' } } }],
            },
            { role: 'tool', content: '{"results":[]}', tool_name: 'web_search' },
            { role: 'assistant', content: 'final **result**' },
          ],
        },
      },
    ]

    const chatRoutes: Route[] = [
      ...defaultRoutes,
      {
        method: 'POST',
        match: (url) => url === '/api/chat',
        respond: () => ndjsonResponse(chatEvents),
      },
    ]
    stubFetch(chatRoutes)
    renderChat()
    await screen.findByText('stored question')

    // Enable thinking in the UI toggle; tools default on.
    fireEvent.click(screen.getByTestId('think-toggle'))

    const input = screen.getByTestId('composer-input')
    fireEvent.change(input, { target: { value: 'Hello app' } })
    fireEvent.click(screen.getByTestId('send-button'))

    // Streaming UI: user bubble, thinking block, tool chip, tool result.
    // Re-query inside waitFor: the 'done' event re-renders the message list,
    // which can detach nodes found by a one-shot findBy*.
    await waitFor(() => {
      expect(screen.getAllByText('Hello app').length).toBeGreaterThan(0)
    })
    await waitFor(() => {
      expect(screen.getByTestId('thinking-block')).toHaveTextContent('Thinking about it…')
    })
    await waitFor(() => {
      expect(screen.getByTestId('tool-calls-block')).toHaveTextContent('web_search')
    })
    await waitFor(() => {
      expect(screen.getByTestId('tool-result-block')).toHaveTextContent('web_search')
    })

    // After 'done': final markdown answer and refreshed title.
    await waitFor(() => {
      const markdown = Array.from(document.querySelectorAll('.markdown'))
      expect(markdown.some((block) => block.textContent?.includes('final result'))).toBe(true)
      expect(document.querySelector('.markdown strong')).toHaveTextContent('result')
      expect(screen.getByRole('heading', { name: 'Hello app' })).toBeInTheDocument()
    })

    // The chat request carried the toggles.
    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => String(call[0]).includes('/api/chat'),
      )
      expect(calls.length).toBeGreaterThan(0)
      const body = JSON.parse(String(calls[0][1].body))
      expect(body).toEqual({
        conversationId: ID,
        content: 'Hello app',
        think: true,
        tools: true,
      })
    })
  })

  it('shows an error banner when the chat request fails', async () => {
    const failingRoutes: Route[] = [
      ...defaultRoutes,
      {
        method: 'POST',
        match: (url) => url === '/api/chat',
        respond: () => jsonResponse({ error: 'invalid api key' }, 500),
      },
    ]
    stubFetch(failingRoutes)
    renderChat()
    await screen.findByText('stored question')

    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'hi' } })
    fireEvent.click(screen.getByTestId('send-button'))

    expect(await screen.findByTestId('error-banner')).toHaveTextContent('invalid api key')
  })

  it('creates a new conversation from the sidebar button', async () => {
    const newConversation: Conversation = {
      id: 'b'.repeat(32),
      title: 'New conversation',
      model: 'test-model:cloud',
      system_prompt: 'Fresh prompt',
      created_at: '2026-09-03T00:00:00Z',
      updated_at: '2026-09-03T00:00:00Z',
      messages: [],
    }
    let created = false
    const routes: Route[] = [
      {
        method: 'GET',
        match: (url) => url === '/api/conversations',
        respond: () =>
          jsonResponse({
            conversations: created
              ? [
                  { ...newConversation, messages: undefined },
                  meta('Stored conversation', '2026-09-02T00:00:00Z'),
                ]
              : [meta('Stored conversation', '2026-09-02T00:00:00Z')],
          }),
      },
      {
        method: 'GET',
        match: (url) => url === '/api/archive',
        respond: () => jsonResponse({ conversations: [] }),
      },
      {
        method: 'GET',
        match: (url) => url === `/api/conversations/${ID}`,
        respond: () => jsonResponse(conversation()),
      },
      {
        method: 'POST',
        match: (url) => url === '/api/conversations',
        respond: () => {
          created = true
          return jsonResponse(newConversation, 201)
        },
      },
    ]
    stubFetch(routes)
    renderChat()
    await screen.findByText('stored question')

    fireEvent.click(screen.getByText('+ New conversation'))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'New conversation' })).toBeInTheDocument()
    })
    expect(screen.queryByText('stored question')).toBeNull()

    // The new conversation's default system prompt is loaded and editable.
    fireEvent.click(screen.getByText('System prompt'))
    const editor = await screen.findByTestId('system-prompt-editor')
    expect(editor.querySelector('textarea')).toHaveValue('Fresh prompt')
  })

  it('archives the active conversation and can restore it', async () => {
    let archived = false
    const routes: Route[] = [
      {
        method: 'GET',
        match: (url) => url === '/api/conversations',
        respond: () =>
          jsonResponse({
            conversations: archived
              ? [{ ...meta('Stored conversation', '2026-09-02T00:00:00Z'), id: 'd'.repeat(32), title: 'Replacement' }]
              : [meta('Stored conversation', '2026-09-02T00:00:00Z')],
          }),
      },
      {
        method: 'GET',
        match: (url) => url === '/api/archive',
        respond: () =>
          jsonResponse({
            conversations: archived ? [meta('Stored conversation', '2026-09-02T00:00:00Z')] : [],
          }),
      },
      {
        method: 'GET',
        match: (url) => url === `/api/conversations/${ID}`,
        respond: () => jsonResponse(conversation()),
      },
      {
        method: 'GET',
        match: (url) => url === `/api/conversations/${'d'.repeat(32)}`,
        respond: () =>
          jsonResponse({
            ...conversation(),
            id: 'd'.repeat(32),
            title: 'Replacement',
            messages: [],
          }),
      },
      {
        method: 'POST',
        match: (url) => url === `/api/conversations/${ID}/archive`,
        respond: ({ body }) => {
          expect(body).toEqual({ action: 'archive' })
          archived = true
          return jsonResponse({ status: 'ok' })
        },
      },
    ]
    stubFetch(routes)
    renderChat()
    await screen.findByText('stored question')

    fireEvent.click(screen.getByLabelText('Archive Stored conversation'))

    // Item moves to the Archived section; a replacement becomes active.
    await waitFor(() => {
      expect(screen.getByTestId(`archived-${ID}`)).toBeInTheDocument()
      expect(screen.queryByTestId(`conversation-${ID}`)).toBeNull()
      expect(screen.getByRole('heading', { name: 'Replacement' })).toBeInTheDocument()
    })
  })

  it('saves an edited system prompt', async () => {
    const routes: Route[] = [
      ...defaultRoutes,
      {
        method: 'PATCH',
        match: (url) => url === `/api/conversations/${ID}`,
        respond: ({ body }) =>
          jsonResponse({
            ...conversation(),
            system_prompt: (body as { system_prompt: string }).system_prompt,
          }),
      },
    ]
    stubFetch(routes)
    renderChat()
    await screen.findByText('stored question')

    fireEvent.click(screen.getByText('System prompt'))
    const editor = await screen.findByTestId('system-prompt-editor')
    fireEvent.change(editor.querySelector('textarea')!, { target: { value: 'New prompt text' } })
    fireEvent.click(screen.getByText('Save system prompt'))

    await waitFor(() => {
      expect(screen.queryByTestId('system-prompt-editor')).toBeNull()
    })
    // Reopening shows the saved value.
    fireEvent.click(screen.getByText('System prompt'))
    expect(await screen.findByTestId('system-prompt-editor')).toHaveTextContent('New prompt text')
  })
})