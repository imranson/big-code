import { describe, it, expect, vi } from 'vitest'
import { getTools, executeTool, TOOL_NAMES } from '@/lib/tools'
import type { WebClient } from '@/lib/types'

function fakeWebClient(): WebClient {
  return {
    webSearch: vi.fn(async () => ({ results: [{ content: 'hit' }] })),
    webFetch: vi.fn(async () => ({ title: 't', url: 'u', content: 'body', links: [] })),
  }
}

describe('getTools', () => {
  const tools = getTools()

  it('returns the three expected tools', () => {
    const names = tools.map((t) => t.function.name)
    expect(names).toEqual([...TOOL_NAMES])
  })

  it('marks the required arguments for web_search and web_fetch', () => {
    const search = tools.find((t) => t.function.name === 'web_search')!
    const fetch = tools.find((t) => t.function.name === 'web_fetch')!
    expect(search.function.parameters?.required).toEqual(['query'])
    expect(fetch.function.parameters?.required).toEqual(['url'])
  })
})

describe('executeTool', () => {
  it('calls webSearch with the query and max results', async () => {
    const client = fakeWebClient()
    const result = await executeTool('web_search', { query: 'ollama', max_results: 3 }, client)
    expect(client.webSearch).toHaveBeenCalledWith({ query: 'ollama', maxResults: 3 })
    expect(JSON.parse(result)).toEqual({ results: [{ content: 'hit' }] })
  })

  it('calls webFetch with the url', async () => {
    const client = fakeWebClient()
    const result = await executeTool('web_fetch', { url: 'https://example.com' }, client)
    expect(client.webFetch).toHaveBeenCalledWith({ url: 'https://example.com' })
    expect(JSON.parse(result)).toEqual({ title: 't', url: 'u', content: 'body', links: [] })
  })

  it('returns the injected system datetime as ISO 8601', async () => {
    const client = fakeWebClient()
    const now = () => new Date('2026-09-24T10:30:00Z')
    const result = await executeTool('get_current_datetime', {}, client, now)
    expect(result).toBe('2026-09-24T10:30:00.000Z')
  })

  it('throws on an unknown tool', async () => {
    const client = fakeWebClient()
    await expect(executeTool('nope', {}, client)).rejects.toThrow('Unknown tool: nope')
  })
})
