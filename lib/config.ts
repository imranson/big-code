export const DEFAULT_MODEL = 'kimi-k2.6:cloud'
export const DEFAULT_CONTEXT_WINDOW = 128_000

export interface AppConfig {
  model: string
  contextWindow: number
  host: string
}

/** Client-safe config: reads server-side env where available, falls back to defaults. */
export function resolveConfig(): AppConfig {
  return {
    model: process.env.OLLAMA_MODEL ?? DEFAULT_MODEL,
    contextWindow: Number(process.env.OLLAMA_CONTEXT_WINDOW ?? DEFAULT_CONTEXT_WINDOW) || DEFAULT_CONTEXT_WINDOW,
    host: process.env.OLLAMA_HOST ?? 'https://ollama.com',
  }
}
