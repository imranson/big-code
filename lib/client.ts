import { parseNdjsonStream } from './ndjson'
import type { AgentEvent } from './agent'
import type { ChatRequestBody } from './types'

export interface StreamHandle {
  abort: () => void
  done: Promise<void>
}

/** Streams a chat turn from the app's own API route, invoking `onEvent` for each NDJSON event. */
export async function streamChat(
  body: ChatRequestBody,
  onEvent: (event: AgentEvent) => void,
): Promise<StreamHandle> {
  const controller = new AbortController()
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed with status ${response.status}`)
  }

  const done = (async () => {
    for await (const event of parseNdjsonStream<AgentEvent>(response.body!)) {
      onEvent(event)
    }
  })()

  return { abort: () => controller.abort(), done }
}
