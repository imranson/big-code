import { describe, expect, it } from 'vitest'

import { contextUsage, estimateConversationTokens, estimateTokens } from '@/lib/context-window'
import type { ChatMessage } from '@/types'

describe('estimateTokens', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('uses ~4 characters per token, rounding up', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
    expect(estimateTokens('abcdefgh')).toBe(2)
  })
})

describe('estimateConversationTokens', () => {
  it('includes the system prompt and message contents', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'abcd' }]
    const total = estimateConversationTokens(messages, 'abcd')
    // 1 token content + 1 token system prompt + per-message overheads.
    expect(total).toBeGreaterThanOrEqual(4)
  })

  it('counts thinking and tool structure', () => {
    const simple = estimateConversationTokens([{ role: 'user', content: 'x'.repeat(40) }])
    const rich = estimateConversationTokens([
      {
        role: 'assistant',
        content: 'x'.repeat(40),
        thinking: 'y'.repeat(40),
        tool_calls: [{ function: { name: 'web_search', arguments: { query: 'z'.repeat(40) } } }],
      },
      { role: 'tool', content: 'w'.repeat(40), tool_name: 'web_search' },
    ])
    expect(rich).toBeGreaterThan(simple)
  })

  it('ignores an empty system prompt', () => {
    expect(estimateConversationTokens([{ role: 'user', content: 'abcd' }], '')).toBe(
      estimateConversationTokens([{ role: 'user', content: 'abcd' }]),
    )
  })
})

describe('contextUsage', () => {
  it('computes the percentage of the nominal window', () => {
    const usage = contextUsage(13107, 131072)
    expect(usage.percent).toBe(10)
    expect(usage.level).toBe('ok')
  })

  it('flags warnings at 50% and danger at 80%', () => {
    expect(contextUsage(65536, 131072).level).toBe('warn')
    expect(contextUsage(120000, 131072).level).toBe('danger')
  })

  it('handles a zero window without dividing by zero', () => {
    expect(contextUsage(100, 0).percent).toBe(0)
  })
})