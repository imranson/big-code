'use client'

import type { ChatMessage } from '@/types'

import Markdown from './Markdown'
import ThinkingBlock from './ThinkingBlock'
import ToolCallsBlock from './ToolCallsBlock'
import ToolResultBlock from './ToolResultBlock'

/**
 * Renders one chat message. Draft (still-streaming) messages use the same
 * components so live streaming looks identical to persisted history.
 */
export default function MessageItem({
  message,
  streaming = false,
}: {
  message: ChatMessage
  streaming?: boolean
}) {
  if (message.role === 'user') {
    return (
      <div className="message user" data-role="user">
        <div className="bubble">{message.content}</div>
      </div>
    )
  }

  if (message.role === 'tool') {
    return <ToolResultBlock toolName={message.tool_name ?? 'tool'} content={message.content} />
  }

  const showCursor = streaming && !message.tool_calls?.length && message.content === ''

  return (
    <div className="message assistant" data-role="assistant">
      {message.thinking ? <ThinkingBlock thinking={message.thinking} streaming={streaming} /> : null}
      {message.tool_calls?.length ? <ToolCallsBlock calls={message.tool_calls} /> : null}
      {message.content ? <Markdown content={message.content} /> : null}
      {showCursor ? <span className="streaming-cursor" aria-label="streaming" /> : null}
    </div>
  )
}