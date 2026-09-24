/**
 * Parses a newline-delimited JSON stream (as produced by the chat route) into individual events.
 * Incomplete or malformed lines are skipped.
 */
export async function* parseNdjsonStream<T = unknown>(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<T> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        const trimmed = line.trim()
        if (trimmed) {
          try {
            yield JSON.parse(trimmed) as T
          } catch {
            // Skip malformed lines.
          }
        }
      }
    }

    const rest = buffer.trim()
    if (rest) {
      try {
        yield JSON.parse(rest) as T
      } catch {
        // Skip a malformed trailing line.
      }
    }
  } finally {
    reader.releaseLock()
  }
}
