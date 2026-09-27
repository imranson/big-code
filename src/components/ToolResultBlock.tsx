'use client'

/** Collapsible block showing a tool's raw result. */
export default function ToolResultBlock({
  toolName,
  content,
}: {
  toolName: string
  content: string
}) {
  return (
    <details className="tool-result-block" data-testid="tool-result-block">
      <summary>
        Result · <strong>{toolName}</strong>
      </summary>
      <div className="tool-result-content">{content}</div>
    </details>
  )
}