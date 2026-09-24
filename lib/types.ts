import type { ChatRequest, ChatResponse, Message } from 'ollama'

/** User-facing thinking control. Mapped to the Ollama `think` field at request time. */
export type ThinkLevel = 'off' | 'auto' | 'low' | 'medium' | 'high'

/** A conversation message, stored exactly in the shape the Ollama SDK expects. */
export type ChatMessage = Message

export interface Conversation {
  id: string
  title: string
  model: string
  system_prompt: string
  created_at: string
  updated_at: string
  messages: ChatMessage[]
}

/** Conversation without messages, used for the sidebar list. */
export interface ConversationMeta {
  id: string
  title: string
  model: string
  created_at: string
  updated_at: string
}

export interface ChatRequestBody {
  conversationId: string
  model: string
  systemPrompt: string
  think: ThinkLevel
  messages: ChatMessage[]
}

/** Subset of the Ollama client used for web tools. */
export interface WebClient {
  webSearch(req: { query: string; maxResults?: number }): Promise<{ results: { content: string }[] }>
  webFetch(req: { url: string }): Promise<{ title: string; url: string; content: string; links: string[] }>
}

/** Subset of the Ollama client used by the chat agent. */
export interface ChatClient extends WebClient {
  chat(req: ChatRequest & { stream: true }): Promise<AsyncIterable<ChatResponse>>
}
