import { Ollama } from 'ollama'
import type { ChatRequest, Message } from 'ollama'

import { loadConfig, type AppConfig } from '@/lib/config'

/** One streamed chunk from a chat request (the fields this app consumes). */
export interface ChatStreamChunk {
  message: Message
  done: boolean
  prompt_eval_count?: number
  eval_count?: number
}

/**
 * The subset of the Ollama SDK client this app uses. Keeping it as a local
 * structural type lets unit tests provide scripted fakes without the real
 * SDK's overloaded signatures.
 */
export interface OllamaLike {
  chat: (request: ChatRequest & { stream: true }) => Promise<AsyncIterable<ChatStreamChunk>>
  webSearch: (request: { query: string; maxResults?: number }) => Promise<{ results: { content: string }[] }>
  webFetch: (request: { url: string }) => Promise<{
    title: string
    url: string
    content: string
    links: string[]
  }>
}

/**
 * Builds an Ollama SDK client pointed at the configured host. With the
 * default OLLAMA_HOST=https://ollama.com and an API key this uses Ollama's
 * web APIs only — no local Ollama server is required.
 */
export function createOllamaClient(config: AppConfig): OllamaLike {
  const client = new Ollama({
    host: config.host,
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
  })
  // The real SDK's chat overloads are wider than the structural type above;
  // its stream responses satisfy ChatStreamChunk structurally.
  return client as unknown as OllamaLike
}

/** Client instance for API routes; tests mock this module to inject fakes. */
export function getOllamaClient(): OllamaLike {
  return createOllamaClient(loadConfig())
}