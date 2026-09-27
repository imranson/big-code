export interface ToolFunction {
  name: string;
  description?: string;
  parameters?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
}

export interface Tool {
  type: "function";
  function: ToolFunction;
}

/** The three function tools exposed to the model. */
export function getTools(): Tool[] {
  return [
    {
      type: "function",
      function: {
        name: "web_search",
        description: "Performs a web search for the given query and returns result snippets.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query string." },
            max_results: {
              type: "number",
              description: "The maximum number of results to return (default 3).",
            },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "web_fetch",
        description: "Fetches and returns the text content of a single web page by URL.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "A single URL to fetch." },
          },
          required: ["url"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_current_datetime",
        description: "Returns the precise current system date and time in ISO 8601 format.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
  ];
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Execute a tool by name, delegating to the Ollama client where relevant. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  client: { webSearch?: (a: { query: string; maxResults?: number }) => Promise<unknown>; webFetch?: (a: { url: string }) => Promise<unknown> },
  now: () => Date = () => new Date(),
): Promise<string> {
  if (name === "get_current_datetime") {
    return now().toISOString();
  }

  if (name === "web_search") {
    const raw = args.max_results ?? args.maxResults;
    const maxResults = toNumber(raw);
    const result = await client.webSearch!({ query: String(args.query ?? ""), maxResults });
    return JSON.stringify(result);
  }

  if (name === "web_fetch") {
    const result = await client.webFetch!({ url: String(args.url ?? "") });
    return JSON.stringify(result);
  }

  throw new Error(`Unknown tool: ${name}`);
}
