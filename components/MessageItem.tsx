'use client'
import type { TranscriptNode } from '@/lib/transcript'

function prettyArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
}

export function MessageItem({ node }: { node: TranscriptNode }) {
  switch (node.kind) {
    case 'user':
      return (
        <div className="message user">
          <div className="bubble">{node.content}</div>
        </div>
      )

    case 'assistant': {
      const hasThinking = node.thinking.trim() !== ''
      return (
        <div className="message assistant">
          {hasThinking && (
            <details className="thinking" open={node.streaming}>
              <summary>Thinking{node.streaming ? '…' : ''}</summary>
              <pre>{node.thinking}</pre>
            </details>
          )}
          {node.content && <div className="bubble">{node.content}</div>}
          {node.streaming && <span className="cursor" aria-hidden="true" />}
        </div>
      )
    }

    case 'tool-call':
      return (
        <div className="tool-call">
          <span className="tool-badge">tool</span>
          <span className="tool-name">{node.name}</span>
          {node.pending && <span className="spinner">…</span>}
          <pre className="tool-args">{prettyArgs(node.arguments)}</pre>
        </div>
      )

    case 'tool-result':
      return (
        <div className="tool-result">
          <span className="tool-badge">result</span>
          <span className="tool-name">{node.name}</span>
          <pre className="tool-args">{node.content}</pre>
        </div>
      )

    case 'error':
      return <div className="message error">{node.content}</div>
  }
}
