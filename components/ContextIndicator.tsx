'use client'
import type { ContextUsage } from '@/lib/context'

export function ContextIndicator({ usage }: { usage: ContextUsage }) {
  const { used, total, percent } = usage
  return (
    <div
      className="context-indicator"
      role="meter"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Context window usage estimate"
      title={`~${used.toLocaleString()} / ${total.toLocaleString()} tokens estimated`}
    >
      <span className="context-label">Context ~{percent}%</span>
      <div className="context-bar">
        <div className="context-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
