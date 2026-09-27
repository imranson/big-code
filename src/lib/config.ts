import path from 'node:path'

export interface AppConfig {
  /** Ollama cloud API key (https://ollama.com/settings/keys). */
  apiKey: string
  /** Where the Ollama SDK sends chat requests. https://ollama.com = cloud web APIs. */
  host: string
  /** Default chat model. */
  model: string
  /** Nominal context window (tokens) used for the rough context-usage estimate. */
  contextWindow: number
  /** Directory holding conversation JSON files (conversations/ and archive/). */
  dataDir: string
}

interface EnvLike {
  [key: string]: string | undefined
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Reads app configuration from the environment. Reads are done per call so
 * tests (and the dev server) can change env vars without module reloads.
 */
export function loadConfig(env: EnvLike = process.env): AppConfig {
  return {
    apiKey: env.OLLAMA_API_KEY ?? '',
    host: env.OLLAMA_HOST ?? 'https://ollama.com',
    model: env.OLLAMA_MODEL ?? 'kimi-k2.6:cloud',
    contextWindow: int(env.OLLAMA_CONTEXT_WINDOW, 131072),
    dataDir: env.DATA_DIR ?? path.join(process.cwd(), 'data'),
  }
}