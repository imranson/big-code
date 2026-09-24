import { Ollama } from 'ollama'
import type { ChatClient } from './types'

/**
 * Creates an Ollama client pointed at the cloud API (https://ollama.com) so the app talks to
 * web APIs only, never a local Ollama server. The API key is read from the environment and kept
 * server-side.
 */
export function getOllamaClient(): ChatClient {
  const host = process.env.OLLAMA_HOST ?? 'https://ollama.com'
  const apiKey = process.env.OLLAMA_API_KEY
  return new Ollama({
    host,
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  }) as unknown as ChatClient
}
