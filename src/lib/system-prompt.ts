const TOOL_LINES = [
  '- web_search: Performs a web search for the given query and returns result snippets.',
  '- web_fetch: Fetches and returns the text content of a single web page by URL.',
  '- get_current_datetime: Returns the precise current system date and time in ISO 8601 format.',
]

/**
 * Default system prompt for new conversations. Mirrors the wording used by the
 * previous Python experiment so archived conversations stay consistent.
 */
export function defaultSystemPrompt(model: string, options?: { tools?: boolean }): string {
  const tools = options?.tools ?? true
  const lines = [
    'You are Assistant, a helpful, accurate and concise assistant.',
    '',
    `You are powered by the model '${model}'.`,
  ]
  if (tools) {
    lines.push(
      'You have access to tools. Prefer them over guessing whenever timeliness or accuracy matters.',
      '',
      'Available tools:',
      ...TOOL_LINES,
    )
  }
  return lines.join('\n')
}