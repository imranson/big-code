'use client'

import type { ToolCall } from '@/types'

/** Chips showing each tool call the assistant made (name + arguments). */
export default function ToolCallsBlock({ calls }: { calls: ToolCall[] }) {
  return (
    <div className="tool-calls-list" data-testid="tool-calls-block">
      {calls.map((call, index) => (
        <span className="tool-call-chip" key={index}>
          <span className="tool-call-name">🛠 {call.function.name}</span>
          <span className="tool-call-args">{JSON.stringify(call.function.arguments ?? {})}</span>
        </span>
      ))}
    </div>
  )
}