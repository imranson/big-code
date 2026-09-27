import { describe, expect, it, vi } from 'vitest'

import { WEB_TOOLS, executeTool, type ToolDeps } from '@/lib/tools'

function makeDeps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    client: {
      webSearch: vi.fn(async () => ({ results: [{ content: 'result text' }] })),
      webFetch: vi.fn(async () => ({
        title: 'Page',
        url: 'https://example.com',
        content: 'page body',
        links: [],
      })),
    },
    ...overrides,
  }
}

describe('WEB_TOOLS', () => {
  it('declares the three web tools', () => {
    expect(WEB_TOOLS.map((tool) => tool.function.name)).toEqual([
      'web_search',
      'web_fetch',
      'get_current_datetime',
    ])
  })
})

describe('executeTool', () => {
  it('runs web_search and returns the SDK response as JSON', async () => {
    const deps = makeDeps()
    const result = await executeTool('web_search', { query: 'ollama js', max_results: 3 }, deps)
    expect(deps.client.webSearch).toHaveBeenCalledWith({ query: 'ollama js', maxResults: 3 })
    expect(JSON.parse(result)).toEqual({ results: [{ content: 'result text' }] })
  })

  it('runs web_fetch', async () => {
    const deps = makeDeps()
    const result = await executeTool('web_fetch', { url: 'https://example.com' }, deps)
    expect(deps.client.webFetch).toHaveBeenCalledWith({ url: 'https://example.com' })
    expect(JSON.parse(result).title).toBe('Page')
  })

  it('returns the current datetime for get_current_datetime', async () => {
    const fixed = new Date('2026-09-27T12:00:00Z')
    const deps = makeDeps({ now: () => fixed })
    const result = await executeTool('get_current_datetime', {}, deps)
    expect(result).toBe(fixed.toISOString())
  })

  it('reports errors for unknown tools', async () => {
    const result = await executeTool('unknown_tool', {}, makeDeps())
    expect(JSON.parse(result).error).toContain('unknown tool')
  })

  it('validates required arguments', async () => {
    expect(JSON.parse(await executeTool('web_search', {}, makeDeps())).error).toContain('query')
    expect(JSON.parse(await executeTool('web_fetch', {}, makeDeps())).error).toContain('url')
  })

  it('catches client failures into an error result', async () => {
    const deps = makeDeps()
    deps.client.webSearch = vi.fn(async () => {
      throw new Error('boom')
    })
    const result = await executeTool('web_search', { query: 'q' }, deps)
    expect(JSON.parse(result).error).toBe('boom')
  })
})