import { describe, it, expect } from 'vitest'
import {
  buildSystemPrompt,
  DEFAULT_SYSTEM_PROMPT_TEMPLATE,
} from '@/lib/systemPrompt'
import { getTools } from '@/lib/tools'

describe('buildSystemPrompt', () => {
  const tools = getTools()

  it('fills in the model name', () => {
    const prompt = buildSystemPrompt({ model: 'gpt-oss:120b', tools })
    expect(prompt).toContain("'gpt-oss:120b'")
    expect(prompt).not.toContain('{{model}}')
  })

  it('lists every available tool by name', () => {
    const prompt = buildSystemPrompt({ model: 'm', tools })
    expect(prompt).toContain('web_search')
    expect(prompt).toContain('web_fetch')
    expect(prompt).toContain('get_current_datetime')
  })

  it('handles an empty tool list', () => {
    const prompt = buildSystemPrompt({ model: 'm', tools: [] })
    expect(prompt).toContain('- (none)')
    expect(prompt).not.toContain('{{tools}}')
  })

  it('supports a custom template with the same placeholders', () => {
    const prompt = buildSystemPrompt({
      model: 'm',
      tools,
      template: 'Model: {{model}}. Tools: {{tools}}',
    })
    expect(prompt).toBe(`Model: m. Tools: ${tools
      .map((t) => `- ${t.function.name}: ${t.function.description ?? '(no description)'}`)
      .join('\n')}`)
  })

  it('leaves unknown placeholders untouched', () => {
    const prompt = buildSystemPrompt({ model: 'm', tools, template: '{{unknown}}' })
    expect(prompt).toBe('{{unknown}}')
  })

  it('the default template is parameterized', () => {
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE).toContain('{{model}}')
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE).toContain('{{tools}}')
  })
})
