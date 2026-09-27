import type { ChatMessage } from '@/types'

/**
 * Rough token estimate for a piece of text: ~4 characters per token is the
 * usual quick heuristic for the models this app targets.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

// Rough per-message protocol overhead (role, framing, tool-call structure).
const MESSAGE_OVERHEAD_TOKENS = 4

/**
 * Rough estimate of the tokens a conversation occupies in the model's context
 * window, including the system prompt, message content, thinking and tool
 * call structure.
 */
export function estimateConversationTokens(messages: ChatMessage[], systemPrompt?: string): number {
  let total = systemPrompt ? estimateTokens(systemPrompt) + MESSAGE_OVERHEAD_TOKENS : 0
  for (const message of messages) {
    total += estimateTokens(message.content) + MESSAGE_OVERHEAD_TOKENS
    if (message.thinking) total += estimateTokens(message.thinking)
    if (message.tool_calls) total += estimateTokens(JSON.stringify(message.tool_calls))
    if (message.tool_name) total += estimateTokens(message.tool_name)
  }
  return total
}

export type ContextLevel = 'ok' | 'warn' | 'danger'

export interface ContextUsage {
  usedTokens: number
  contextWindow: number
  percent: number
  level: ContextLevel
}

/** Turns an estimate into a UI-ready usage summary with a severity level. */
export function contextUsage(usedTokens: number, contextWindow: number): ContextUsage {
  const percent = contextWindow > 0 ? (usedTokens / contextWindow) * 100 : 0
  let level: ContextLevel = 'ok'
  if (percent >= 80) level = 'danger'
  else if (percent >= 50) level = 'warn'
  return {
    usedTokens,
    contextWindow,
    percent: Math.round(percent * 10) / 10,
    level,
  }
}