import { describe, expect, it } from 'vitest'

import { loadConfig } from '@/lib/config'

const EMPTY = {}

describe('loadConfig', () => {
  it('falls back to defaults when the environment is empty', () => {
    const config = loadConfig(EMPTY)
    expect(config.apiKey).toBe('')
    expect(config.host).toBe('https://ollama.com')
    expect(config.model).toBe('kimi-k2.6:cloud')
    expect(config.contextWindow).toBe(131072)
    expect(config.dataDir).toContain('data')
  })

  it('reads values from the environment', () => {
    const config = loadConfig({
      OLLAMA_API_KEY: 'key',
      OLLAMA_HOST: 'https://example.com',
      OLLAMA_MODEL: 'some-model:cloud',
      OLLAMA_CONTEXT_WINDOW: '4096',
      DATA_DIR: '/tmp/somewhere',
    })
    expect(config).toEqual({
      apiKey: 'key',
      host: 'https://example.com',
      model: 'some-model:cloud',
      contextWindow: 4096,
      dataDir: '/tmp/somewhere',
    })
  })

  it('rejects invalid context window values', () => {
    expect(loadConfig({ OLLAMA_CONTEXT_WINDOW: 'nope' }).contextWindow).toBe(131072)
    expect(loadConfig({ OLLAMA_CONTEXT_WINDOW: '-5' }).contextWindow).toBe(131072)
    expect(loadConfig({ OLLAMA_CONTEXT_WINDOW: '0' }).contextWindow).toBe(131072)
  })
})