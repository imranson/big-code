/** A single tool call requested by the assistant (Ollama tool-call format). */
export interface ToolCall {
  id?: string
  function: {
    index?: number
    name: string
    arguments: Record<string, unknown>
  }
}

/** A chat message, persisted in conversation files and sent to Ollama. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  thinking?: string
  tool_calls?: ToolCall[]
  tool_name?: string
}

/** Conversation record persisted as JSON under DATA_DIR. */
export interface Conversation {
  id: string
  title: string
  model: string
  system_prompt: string
  created_at: string
  updated_at: string
  messages: ChatMessage[]
}

/** A conversation without its messages (used for sidebar listings). */
export type ConversationMeta = Omit<Conversation, 'messages'>

/** Options the client sends with each chat turn. */
export interface ChatOptions {
  think: boolean
  tools: boolean
}

/** Body of POST /api/chat. */
export interface ChatRequestBody extends ChatOptions {
  conversationId: string
  content: string
}

/** Events streamed from POST /api/chat as NDJSON lines. */
export type StreamEvent =
  | { type: 'round_start'; round: number }
  | { type: 'thinking'; content: string }
  | { type: 'content'; content: string }
  | { type: 'tool_calls'; tool_calls: ToolCall[] }
  | { type: 'tool_result'; tool_name: string; content: string }
  | { type: 'assistant'; message: ChatMessage }
  | { type: 'usage'; prompt_tokens: number; response_tokens: number }
  | { type: 'done'; conversation: Conversation }
  | { type: 'error'; message: string }