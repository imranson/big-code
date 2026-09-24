import type { Tool } from 'ollama'
import type { WebClient } from './types'

export const TOOL_NAMES = ['web_search', 'web_fetch', 'get_current_datetime'] as const
export type ToolName = (typeof TOOL_NAMES)[number]

/**
 * Tool schemas exposed to the model. `web_search` and `web_fetch` are Ollama's web tools backed by
 * the cloud API; `get_current_datetime` returns the current system date and time.
 */
export function getTools(): Tool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Performs a web search for the given query and returns result snippets.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query string.' },
            max_results: { type: 'number', description: 'Maximum number of results to return (default 5).' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'web_fetch',
        description: 'Fetches and returns the text content of a single web page by URL.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'A single URL to fetch.' },
          },
          required: ['url'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_current_datetime',
        description: 'Returns the precise current system date and time in ISO 8601 format.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
  ]
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/**
 * Executes a tool by name, returning the JSON-serialized result to feed back to the model.
 * `now` is injectable so tests can control the clock.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  client: WebClient,
  now: () => Date = () => new Date(),
): Promise<string> {
  switch (name) {
    case 'web_search': {
      const result = await client.webSearch({
        query: String(args.query ?? ''),
        maxResults: numberOrUndefined(args.max_results ?? args.maxResults),
      })
      return JSON.stringify(result)
    }
    case 'web_fetch': {
      const result = await client.webFetch({ url: String(args.url ?? '') })
      return JSON.stringify(result)
    }
    case 'get_current_datetime':
      return now().toISOString()
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
