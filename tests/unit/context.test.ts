import { describe, it, expect } from 'vitest'
import { estimateTokens, estimateContextUsage } from '@/lib/context'

describe('estimateTokens', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('estimates roughly 4 characters per token', () => {
    expect(estimateTokens('abcdefgh')).toBe(2) // 8 chars / 4
  })

  it('rounds up partial tokens', () => {
    expect(estimateTokens('a')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2) // 5 chars -> ceil(1.25)
  })
})

describe('estimateContextUsage', () => {
  it('computes a percentage from text length', () => {
    // 400 characters -> 100 tokens against a 1000-token window -> 10%
    const text = 'a'.repeat(400)
    const usage = estimateContextUsage({ text, contextWindow: 1000 })
    expect(usage.used).toBe(100)
    expect(usage.total).toBe(1000)
    expect(usage.percent).toBe(10)
  })

  it('clamps the percentage to 100', () => {
    const text = 'a'.repeat(4000)
    const usage = estimateContextUsage({ text, contextWindow: 1000 })
    expect(usage.percent).toBe(100)
  })

  it('never reports a negative percentage', () => {
    const usage = estimateContextUsage({ text: '', contextWindow: 1000 })
    expect(usage.used).toBe(0)
    expect(usage.percent).toBe(0)
  })

  it('falls back to the default window when none or a non-positive value is given', () => {
    expect(estimateContextUsage({ text: 'x' }).total).toBeGreaterThan(0)
    expect(estimateContextUsage({ text: 'x', contextWindow: 0 }).total).toBeGreaterThan(0)
  })
})
