import { describe, expect, it, vi } from 'vitest'

import { readEventStream } from '@/lib/stream-client'
import type { StreamEvent } from '@/types'

function ndjsonResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

describe('readEventStream', () => {
  it('parses NDJSON events, including ones split across chunk boundaries', async () => {
    const events: StreamEvent[] = []
    const response = ndjsonResponse([
      '{"type":"content","content":"Hel"}\n',
      '{"type":"content","cont',
      'ent":"lo"}\n{"type":"usage","prompt_tokens":1,"response_tokens":2}\n',
    ])
    await readEventStream(response, (event) => events.push(event))
    expect(events).toEqual([
      { type: 'content', content: 'Hel' },
      { type: 'content', content: 'lo' },
      { type: 'usage', prompt_tokens: 1, response_tokens: 2 },
    ])
  })

  it('skips malformed lines instead of failing the stream', async () => {
    const onEvent = vi.fn()
    const response = ndjsonResponse(['{broken\n{"type":"content","content":"ok"}\n\n'])
    await readEventStream(response, onEvent)
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith({ type: 'content', content: 'ok' })
  })

  it('throws when the response has no body', async () => {
    await expect(readEventStream(new Response(null), vi.fn())).rejects.toThrow(/no body/)
  })
})