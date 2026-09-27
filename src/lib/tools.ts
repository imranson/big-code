import type { Tool } from 'ollama'

import type { OllamaLike } from '@/lib/ollama'

/** Tool schemas advertised to the model when web tools are enabled. */
export const WEB_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Performs a web search for the given query and returns result snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query string.' },
          max_results: {
            type: 'number',
            description: 'The maximum number of results to return per query (default 5).',
          },
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
          url: { type: 'string', description: 'The URL of the page to fetch.' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_datetime',
      description: "Returns the precise current system date and time in ISO 8601 format. Takes no arguments.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]

/** Dependencies for tool execution (all injectable for testing). */
export interface ToolDeps {
  client: Pick<OllamaLike, 'webSearch' | 'webFetch'>
  now?: () => Date
}

function errorResult(message: string): string {
  return JSON.stringify({ error: message })
}

/**
 * Executes a tool call by name and returns the tool result as a JSON string
 * (the shape the model expects in the following `role: "tool"` message).
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  deps: ToolDeps,
): Promise<string> {
  try {
    switch (name) {
      case 'web_search': {
        const query = String(args.query ?? '')
        if (!query) return errorResult('query is required')
        const maxResults = Number.isFinite(Number(args.max_results))
          ? Number(args.max_results)
          : undefined
        const response = await deps.client.webSearch({ query, maxResults })
        return JSON.stringify(response)
      }
      case 'web_fetch': {
        const url = String(args.url ?? '')
        if (!url) return errorResult('url is required')
        const response = await deps.client.webFetch({ url })
        return JSON.stringify(response)
      }
      case 'get_current_datetime': {
        const now = (deps.now ?? (() => new Date()))()
        return now.toISOString()
      }
      default:
        return errorResult(`unknown tool: ${name}`)
    }
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error))
  }
}