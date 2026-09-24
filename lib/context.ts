import { DEFAULT_CONTEXT_WINDOW } from './config'

/** Rough token estimate: ~4 characters per token for English prose. */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

export interface ContextUsage {
  used: number
  total: number
  /** Integer percentage, clamped to 0..100. */
  percent: number
}

export interface ContextEstimateParams {
  text: string
  contextWindow?: number
}

export function estimateContextUsage({
  text,
  contextWindow = DEFAULT_CONTEXT_WINDOW,
}: ContextEstimateParams): ContextUsage {
  const total = contextWindow > 0 ? contextWindow : DEFAULT_CONTEXT_WINDOW
  const used = estimateTokens(text)
  const percent = Math.max(0, Math.min(100, Math.round((used / total) * 100)))
  return { used, total, percent }
}
