import type { Tool } from 'ollama'

export const DEFAULT_SYSTEM_PROMPT_TEMPLATE = [
  'You are Assistant, a helpful, accurate and concise assistant.',
  '',
  "You are powered by the model '{{model}}'.",
  'You have access to tools. Prefer them over guessing whenever timeliness or accuracy matters.',
  '',
  'Available tools:',
  '{{tools}}',
].join('\n')

export interface SystemPromptParams {
  model: string
  tools: Tool[]
  template?: string
}

function toolsToText(tools: Tool[]): string {
  if (tools.length === 0) return '- (none)'
  return tools
    .map((tool) => `- ${tool.function.name}: ${tool.function.description ?? '(no description)'}`)
    .join('\n')
}

/**
 * Renders a parameterized system prompt. The default template fills in the model name and the list
 * of available tools; a custom template may use the same {{model}} / {{tools}} placeholders.
 */
export function buildSystemPrompt({
  model,
  tools,
  template = DEFAULT_SYSTEM_PROMPT_TEMPLATE,
}: SystemPromptParams): string {
  return template.replaceAll('{{model}}', model).replaceAll('{{tools}}', toolsToText(tools))
}
