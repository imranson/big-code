'use client'

/** Collapsible block for the assistant's reasoning ("thinking") text. */
export default function ThinkingBlock({
  thinking,
  streaming = false,
}: {
  thinking: string
  streaming?: boolean
}) {
  return (
    <details className="thinking-block" data-testid="thinking-block" open={streaming}>
      <summary>Thinking{streaming ? '…' : ''}</summary>
      <div className="thinking-content">{thinking}</div>
    </details>
  )
}