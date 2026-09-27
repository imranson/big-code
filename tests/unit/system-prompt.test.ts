import { describe, expect, it } from 'vitest'

import { defaultSystemPrompt } from '@/lib/system-prompt'

describe('defaultSystemPrompt', () => {
  it('mentions the model and the available tools', () => {
    const prompt = defaultSystemPrompt('kimi-k2.6:cloud')
    expect(prompt).toContain("You are powered by the model 'kimi-k2.6:cloud'.")
    expect(prompt).toContain('web_search')
    expect(prompt).toContain('web_fetch')
    expect(prompt).toContain('get_current_datetime')
  })

  it('omits tool instructions when tools are disabled', () => {
    const prompt = defaultSystemPrompt('m', { tools: false })
    expect(prompt).toContain('You are Assistant')
    expect(prompt).not.toContain('web_search')
  })
})