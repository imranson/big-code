import type { ChatMessage } from './types'
import type { AgentEvent } from './agent'

export type TranscriptNode =
  | { kind: 'user'; content: string }
  | { kind: 'assistant'; content: string; thinking: string; streaming?: boolean }
  | { kind: 'tool-call'; name: string; arguments: Record<string, unknown>; pending?: boolean }
  | { kind: 'tool-result'; name: string; content: string }
  | { kind: 'error'; content: string }

/** Flattens persisted chat messages into display nodes. */
export function messagesToTranscript(messages: ChatMessage[]): TranscriptNode[] {
  const nodes: TranscriptNode[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      nodes.push({ kind: 'user', content: message.content ?? '' })
    } else if (message.role === 'assistant') {
      nodes.push({
        kind: 'assistant',
        content: message.content ?? '',
        thinking: message.thinking ?? '',
        streaming: false,
      })
      for (const toolCall of message.tool_calls ?? []) {
        nodes.push({
          kind: 'tool-call',
          name: toolCall.function.name,
          arguments: toolCall.function.arguments ?? {},
          pending: false,
        })
      }
    } else if (message.role === 'tool') {
      nodes.push({ kind: 'tool-result', name: message.tool_name ?? 'tool', content: message.content ?? '' })
    }
  }
  return nodes
}

/** Applies a single streaming event to the transcript, returning the next transcript. */
export function applyEvent(transcript: TranscriptNode[], event: AgentEvent): TranscriptNode[] {
  switch (event.type) {
    case 'thinking':
    case 'token': {
      const delta = event.delta
      const last = transcript[transcript.length - 1]
      if (last && last.kind === 'assistant' && last.streaming) {
        const updated =
          event.type === 'thinking'
            ? { ...last, thinking: last.thinking + delta }
            : { ...last, content: last.content + delta }
        return [...transcript.slice(0, -1), updated]
      }
      return [
        ...transcript,
        {
          kind: 'assistant',
          content: event.type === 'token' ? delta : '',
          thinking: event.type === 'thinking' ? delta : '',
          streaming: true,
        },
      ]
    }
    case 'tool_call': {
      const closed = transcript.map((node) =>
        node.kind === 'assistant' && node.streaming ? { ...node, streaming: false } : node,
      )
      return [...closed, { kind: 'tool-call', name: event.name, arguments: event.arguments, pending: true }]
    }
    case 'tool_result': {
      let resolved = false
      const withResult = transcript.map((node) => {
        if (!resolved && node.kind === 'tool-call' && node.pending) {
          resolved = true
          return { ...node, pending: false }
        }
        return node
      })
      return [...withResult, { kind: 'tool-result', name: event.name, content: event.content }]
    }
    case 'done': {
      return transcript.map((node) =>
        node.kind === 'assistant' && node.streaming ? { ...node, streaming: false } : node,
      )
    }
    case 'error':
      return [...transcript, { kind: 'error', content: event.error }]
  }
}

/** Rough text representation of the transcript, used for the context-window estimate. */
export function transcriptToText(transcript: TranscriptNode[]): string {
  const parts: string[] = []
  for (const node of transcript) {
    switch (node.kind) {
      case 'user':
        parts.push(node.content)
        break
      case 'assistant':
        if (node.thinking) parts.push(node.thinking)
        parts.push(node.content)
        break
      case 'tool-call':
        parts.push(`${node.name} ${JSON.stringify(node.arguments)}`)
        break
      case 'tool-result':
        parts.push(node.content)
        break
      case 'error':
        parts.push(node.content)
        break
    }
  }
  return parts.join('\n')
}
