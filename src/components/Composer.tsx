'use client'

import { type KeyboardEvent } from 'react'

export interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  think: boolean
  onThinkChange: (think: boolean) => void
  tools: boolean
  onToolsChange: (tools: boolean) => void
  streaming: boolean
}

/** Message input with thinking / web-tools toggles and send/stop buttons. */
export default function Composer({
  value,
  onChange,
  onSend,
  onStop,
  think,
  onThinkChange,
  tools,
  onToolsChange,
  streaming,
}: ComposerProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!streaming && value.trim()) onSend()
    }
  }

  return (
    <div className="composer">
      <div className="composer-inner">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message the assistant…  (Enter to send, Shift+Enter for a new line)"
          aria-label="Message input"
          rows={1}
          data-testid="composer-input"
        />
        <div className="composer-controls">
          <label className="composer-toggle">
            <input
              type="checkbox"
              checked={think}
              onChange={(event) => onThinkChange(event.target.checked)}
              data-testid="think-toggle"
            />
            Thinking
          </label>
          <label className="composer-toggle">
            <input
              type="checkbox"
              checked={tools}
              onChange={(event) => onToolsChange(event.target.checked)}
              data-testid="tools-toggle"
            />
            Web tools
          </label>
          <div className="composer-actions">
            {streaming ? (
              <button className="stop-button" onClick={onStop} data-testid="stop-button">
                Stop
              </button>
            ) : (
              <button
                className="send-button"
                onClick={onSend}
                disabled={!value.trim()}
                data-testid="send-button"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}