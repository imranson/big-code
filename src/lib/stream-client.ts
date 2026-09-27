import type { StreamEvent } from '@/types'

/**
 * Reads an NDJSON event stream (POST /api/chat) and dispatches each parsed
 * event to `onEvent`. Malformed lines are skipped rather than fatal.
 */
export async function readEventStream(
  response: Response,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error('Response has no body to stream.')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!line) continue
        try {
          onEvent(JSON.parse(line) as StreamEvent)
        } catch {
          // Ignore malformed lines; later events should still arrive.
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}