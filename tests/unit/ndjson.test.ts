import { describe, it, expect } from 'vitest'
import { parseNdjsonStream } from '@/lib/ndjson'

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const encoded = chunks.map((c) => encoder.encode(c))
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of encoded) controller.enqueue(chunk)
      controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = []
  for await (const value of parseNdjsonStream(stream)) out.push(value)
  return out
}

describe('parseNdjsonStream', () => {
  it('parses one JSON object per line', async () => {
    const stream = streamFromChunks(['{"a":1}\n{"a":2}\n'])
    expect(await collect(stream)).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('handles an object split across multiple chunks', async () => {
    const stream = streamFromChunks(['{"a":', '1}\n', '{"a":2}\n'])
    expect(await collect(stream)).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('skips malformed lines and empty lines', async () => {
    const stream = streamFromChunks(['{"a":1}\n', 'not-json\n', '\n', '{"a":2}\n'])
    expect(await collect(stream)).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('flushes a trailing object without a newline', async () => {
    const stream = streamFromChunks(['{"a":1}'])
    expect(await collect(stream)).toEqual([{ a: 1 }])
  })
})
