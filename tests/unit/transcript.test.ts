import { describe, it, expect } from 'vitest'
import {
  applyEvent,
  messagesToTranscript,
  transcriptToText,
  type TranscriptNode,
} from '@/lib/transcript'
import type { ChatMessage } from '@/lib/types'

describe('messagesToTranscript', () => {
  it('maps user, assistant, tool-call and tool messages', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: '',
        thinking: 'thinking…',
        tool_calls: [{ function: { name: 'web_search', arguments: { query: 'x' } } }],
      },
      { role: 'tool', content: 'result', tool_name: 'web_search' },
      { role: 'assistant', content: 'answer' },
    ]
    const nodes = messagesToTranscript(messages)
    expect(nodes).toEqual([
      { kind: 'user', content: 'hi' },
      { kind: 'assistant', content: '', thinking: 'thinking…', streaming: false },
      { kind: 'tool-call', name: 'web_search', arguments: { query: 'x' }, pending: false },
      { kind: 'tool-result', name: 'web_search', content: 'result' },
      { kind: 'assistant', content: 'answer', thinking: '', streaming: false },
    ])
  })
})

describe('applyEvent', () => {
  it('appends thinking and token deltas to the current streaming assistant node', () => {
    let nodes: TranscriptNode[] = []
    nodes = applyEvent(nodes, { type: 'thinking', delta: 'one' })
    nodes = applyEvent(nodes, { type: 'thinking', delta: ' two' })
    nodes = applyEvent(nodes, { type: 'token', delta: 'Hi' })
    nodes = applyEvent(nodes, { type: 'token', delta: '!' })

    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ kind: 'assistant', thinking: 'one two', content: 'Hi!', streaming: true })
  })

  it('starts a new assistant node after a tool result', () => {
    let nodes: TranscriptNode[] = []
    nodes = applyEvent(nodes, { type: 'tool_call', name: 'web_search', arguments: {} })
    nodes = applyEvent(nodes, { type: 'tool_result', name: 'web_search', content: 'r' })
    nodes = applyEvent(nodes, { type: 'token', delta: 'answer' })

    expect(nodes.map((n) => n.kind)).toEqual(['tool-call', 'tool-result', 'assistant'])
  })

  it('closes the streaming assistant node on a tool call and resolves pending tools', () => {
    let nodes: TranscriptNode[] = []
    nodes = applyEvent(nodes, { type: 'token', delta: 'partial' })
    nodes = applyEvent(nodes, { type: 'tool_call', name: 'get_current_datetime', arguments: {} })

    expect(nodes[0]).toMatchObject({ kind: 'assistant', streaming: false })
    expect(nodes[1]).toMatchObject({ kind: 'tool-call', pending: true })

    nodes = applyEvent(nodes, { type: 'tool_result', name: 'get_current_datetime', content: 'now' })
    expect(nodes[1]).toMatchObject({ kind: 'tool-call', pending: false })
    expect(nodes[2]).toMatchObject({ kind: 'tool-result' })
  })

  it('appends an error node', () => {
    const nodes = applyEvent([], { type: 'error', error: 'boom' })
    expect(nodes).toEqual([{ kind: 'error', content: 'boom' }])
  })
})

describe('transcriptToText', () => {
  it('joins all node text for the context estimate', () => {
    const nodes: TranscriptNode[] = [
      { kind: 'user', content: 'hi' },
      { kind: 'assistant', content: 'hello', thinking: 'th' },
      { kind: 'tool-call', name: 'web_search', arguments: { query: 'x' } },
    ]
    const text = transcriptToText(nodes)
    expect(text).toContain('hi')
    expect(text).toContain('th')
    expect(text).toContain('hello')
    expect(text).toContain('web_search')
  })
})
