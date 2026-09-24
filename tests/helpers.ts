import type { ChatResponse, ToolCall } from 'ollama'
import type { ChatClient } from '@/lib/types'

export function chunk(partial: {
  content?: string
  thinking?: string
  tool_calls?: ToolCall[]
  role?: string
}): ChatResponse {
  return {
    model: 'gpt-oss:120b',
    created_at: new Date(),
    message: {
      role: partial.role ?? 'assistant',
      content: partial.content ?? '',
      thinking: partial.thinking,
      tool_calls: partial.tool_calls,
    },
    done: false,
    done_reason: '',
    total_duration: 0,
    load_duration: 0,
    prompt_eval_count: 0,
    prompt_eval_duration: 0,
    eval_count: 0,
    eval_duration: 0,
  } as ChatResponse
}

/** Returns a fake chat client whose `chat` method yields the given chunk arrays in order. */
export function fakeChatClient(responses: ChatResponse[][]): ChatClient {
  let call = 0
  return {
    chat: async () => {
      const chunks = responses[Math.min(call, responses.length - 1)]
      call += 1
      return (async function* () {
        for (const chunk of chunks) yield chunk
      })()
    },
    webSearch: async () => ({ results: [{ content: 'search result' }] }),
    webFetch: async () => ({ title: 'title', url: 'https://example.com', content: 'content', links: [] }),
  }
}

export async function collectEvents<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const events: T[] = []
  for await (const event of gen) events.push(event)
  return events
}

export function toolCall(name: string, args: Record<string, unknown>): ToolCall {
  return { function: { name, arguments: args } }
}
