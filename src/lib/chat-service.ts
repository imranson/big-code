import type { ChatRequest, Message } from 'ollama'

import type { ChatStreamChunk, OllamaLike } from '@/lib/ollama'
import { WEB_TOOLS, executeTool } from '@/lib/tools'
import type { ChatMessage, StreamEvent, ToolCall } from '@/types'

/** Safety cap on how many model→tool round trips a single turn may take. */
export const DEFAULT_MAX_TOOL_ROUNDS = 8

export interface ChatStreamDeps {
  client: OllamaLike
  /** Tool executor; defaults to the web/datetime tools backed by `client`. */
  executeTool?: (name: string, args: Record<string, unknown>) => Promise<string>
  maxToolRounds?: number
  /** Aborted when the client disconnects; the loop stops and persists partials. */
  signal?: AbortSignal
}

export interface ChatStreamOptions {
  model: string
  systemPrompt: string
  /** Prior conversation messages (the new user message included). */
  messages: ChatMessage[]
  think: boolean
  tools: boolean
}

function assistantMessage(thinking: string, content: string, toolCalls?: ToolCall[]): ChatMessage {
  const message: ChatMessage = { role: 'assistant', content }
  if (thinking) message.thinking = thinking
  if (toolCalls?.length) message.tool_calls = toolCalls
  return message
}

function isEmptyArguments(args: Record<string, unknown> | undefined): boolean {
  return !args || Object.keys(args).length === 0
}

/**
 * Merges streamed tool-call chunks. Ollama streams tool calls incrementally:
 * chunks carry partial `function.name` / `function.arguments` fragments keyed
 * by `function.index`, and the final `done` chunk may omit tool_calls
 * entirely — so calls must be accumulated across the whole stream.
 */
export function mergeStreamedToolCalls(
  accumulated: ToolCall[],
  incoming: ToolCall[],
): ToolCall[] {
  const next = [...accumulated]
  for (const call of incoming) {
    const index = call.function.index ?? next.length
    const existing = next[index]
    if (!existing) {
      next[index] = { ...call, function: { ...call.function } }
      continue
    }
    const name =
      call.function.name && call.function.name !== existing.function.name
        ? existing.function.name + call.function.name
        : existing.function.name
    let arguments_ = existing.function.arguments
    if (!isEmptyArguments(call.function.arguments)) {
      arguments_ = isEmptyArguments(arguments_)
        ? call.function.arguments
        : { ...arguments_, ...call.function.arguments }
    }
    next[index] = {
      id: call.id ?? existing.id,
      function: { index, name, arguments: arguments_ },
    }
  }
  return next
}

/**
 * Runs one chat turn as an async generator of stream events: streams thinking
 * and content deltas, executes tool calls (web search / web fetch / current
 * datetime) and feeds results back to the model until it produces a plain
 * assistant response or hits the round limit. At most `maxToolRounds` rounds
 * may execute tools; the round after the last one must produce an answer.
 */
export async function* streamChat(
  deps: ChatStreamDeps,
  options: ChatStreamOptions,
): AsyncGenerator<StreamEvent> {
  const runTool =
    deps.executeTool ?? ((name: string, args: Record<string, unknown>) => executeTool(name, args, { client: deps.client }))
  const maxToolRounds = deps.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS

  const requestMessages: Message[] = []
  if (options.systemPrompt) {
    requestMessages.push({ role: 'system', content: options.systemPrompt })
  }
  requestMessages.push(...options.messages)

  for (let round = 0; ; round++) {
    if (deps.signal?.aborted) {
      yield { type: 'error', message: 'Request aborted.' }
      return
    }
    yield { type: 'round_start', round }

    let thinking = ''
    let content = ''
    let toolCalls: ToolCall[] = []
    let usage = { prompt_tokens: 0, response_tokens: 0 }
    let sawDone = false

    try {
      const request: ChatRequest & { stream: true } = {
        model: options.model,
        messages: requestMessages,
        stream: true,
      }
      if (options.think) request.think = true
      if (options.tools) request.tools = WEB_TOOLS

      const stream = await deps.client.chat(request)
      for await (const chunk of stream as AsyncIterable<ChatStreamChunk>) {
        if (deps.signal?.aborted) break
        const message = chunk.message
        if (message?.thinking) {
          thinking += message.thinking
          yield { type: 'thinking', content: message.thinking }
        }
        if (message?.content) {
          content += message.content
          yield { type: 'content', content: message.content }
        }
        if (message?.tool_calls?.length) {
          toolCalls = mergeStreamedToolCalls(toolCalls, message.tool_calls as ToolCall[])
        }
        if (chunk.done) {
          sawDone = true
          usage = {
            prompt_tokens: chunk.prompt_eval_count ?? 0,
            response_tokens: chunk.eval_count ?? 0,
          }
        }
      }
    } catch (error) {
      // Persist whatever streamed before the failure so history stays faithful.
      if (thinking || content) {
        yield { type: 'assistant', message: assistantMessage(thinking, content) }
      }
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
      return
    }

    if (deps.signal?.aborted) {
      if (thinking || content) {
        yield { type: 'assistant', message: assistantMessage(thinking, content) }
      }
      yield { type: 'error', message: 'Request aborted.' }
      return
    }

    if (!sawDone) {
      yield { type: 'error', message: 'Stream ended without a completed message.' }
      return
    }

    if (options.tools && toolCalls.length > 0) {
      if (round >= maxToolRounds) {
        // The model keeps calling tools; refuse to run yet another round.
        yield {
          type: 'error',
          message: `Reached the maximum of ${maxToolRounds} tool rounds for a single turn.`,
        }
        return
      }
      const message = assistantMessage(thinking, content, toolCalls)
      yield { type: 'assistant', message }
      yield { type: 'tool_calls', tool_calls: toolCalls }
      requestMessages.push(message)

      for (const call of toolCalls) {
        const name = call.function.name
        const result = await runTool(name, call.function.arguments ?? {})
        yield { type: 'tool_result', tool_name: name, content: result }
        requestMessages.push({ role: 'tool', content: result, tool_name: name })
      }
      continue
    }

    // Plain assistant response — the turn is complete.
    const message = assistantMessage(thinking, content)
    yield { type: 'assistant', message }
    yield {
      type: 'usage',
      prompt_tokens: usage.prompt_tokens,
      response_tokens: usage.response_tokens,
    }
    return
  }
}