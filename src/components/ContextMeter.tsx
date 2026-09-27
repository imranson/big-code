'use client'

import type { ContextUsage } from '@/lib/context-window'

function formatTokens(count: number): string {
  if (count >= 1024) {
    const k = count / 1024
    return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`
  }
  return String(count)
}

/** Rough context-window usage indicator (bar + percentage label). */
export default function ContextMeter({ usage }: { usage: ContextUsage }) {
  return (
    <div
      className={`context-meter ${usage.level}`}
      data-testid="context-meter"
      title={`Rough estimate: ~${usage.usedTokens} of ${usage.contextWindow} context tokens used`}
    >
      <div className="context-bar">
        <div
          className="context-fill"
          style={{ width: `${Math.min(100, usage.percent)}%` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usage.percent}
        />
      </div>
      <span className="context-label">
        context ~{formatTokens(usage.usedTokens)} / {formatTokens(usage.contextWindow)} tokens (
        {usage.percent}%)
      </span>
    </div>
  )
}