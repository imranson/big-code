import type { Message, Tool, ToolCall } from 'ollama'
import type { ChatClient, ChatMessage, ThinkLevel } from './types'
import { executeTool } from './tools'

export type AgentEvent =
  | { type: 'thinking'; delta: string }
  | { type: 'token'; delta: string }
  | { type: 'tool_call'; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; name: string; content: string }
  | { type: 'done'; messages: ChatMessage[] }
  | { type: 'error'; error: string }

export interface RunAgentOptions {
  client: ChatClient
  model: string
  messages: ChatMessage[]
  system?: string
  think?: ThinkLevel
  tools?: Tool[]
  maxIterations?: number
  now?: () => Date
}

/** Maps the UI think level to the value the Ollama `chat` API expects. */
export function toThinkValue(level?: ThinkLevel): boolean | 'high' | 'medium' | 'low' | undefined {
  switch (level) {
    case 'auto':
      return true
    case 'low':
    case 'medium':
    case 'high':
      return level
    case 'off':
    case undefined:
      return undefined
  }
}

function stripSystem(messages: Message[]): ChatMessage[] {
  return messages.filter((m) => m.role !== 'system')
}

/**
 * Runs a chat turn with tool looping. Yields streaming events (thinking deltas, content tokens,
 * tool calls and tool results) and finally a `done` event carrying the full resulting message list.
 */
export async function* runAgent(options: RunAgentOptions): AsyncGenerator<AgentEvent> {
  const { client, model, system, tools } = options
  const maxIterations = options.maxIterations ?? 8
  const think = toThinkValue(options.think)

  const ollamaMessages: Message[] = [...options.messages]
  if (system) ollamaMessages.unshift({ role: 'system', content: system })

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const stream = await client.chat({ model, messages: ollamaMessages, stream: true, tools, think })

    let content = ''
    let thinking = ''
    const toolCalls: ToolCall[] = []

    for await (const chunk of stream) {
      const message = chunk.message
      if (message.thinking) {
        thinking += message.thinking
        yield { type: 'thinking', delta: message.thinking }
      }
      if (message.content) {
        content += message.content
        yield { type: 'token', delta: message.content }
      }
      if (message.tool_calls && message.tool_calls.length > 0) {
        toolCalls.push(...message.tool_calls)
      }
    }

    if (toolCalls.length === 0) {
      if (content || thinking) {
        ollamaMessages.push({ role: 'assistant', content, thinking })
      }
      yield { type: 'done', messages: stripSystem(ollamaMessages) }
      return
    }

    ollamaMessages.push({ role: 'assistant', content, thinking, tool_calls: toolCalls })

    for (const toolCall of toolCalls) {
      const name = toolCall.function.name
      const args = toolCall.function.arguments ?? {}
      yield { type: 'tool_call', name, arguments: args }

      let result: string
      try {
        result = await executeTool(name, args, client, options.now)
      } catch (error) {
        result = JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })
      }
      yield { type: 'tool_result', name, content: result }
      ollamaMessages.push({ role: 'tool', content: result, tool_name: name })
    }
  }

  yield { type: 'error', error: `Exceeded maximum of ${maxIterations} tool iterations` }
}
