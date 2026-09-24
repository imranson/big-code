'use client'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import type { ThinkLevel } from '@/lib/types'
import type { ContextUsage } from '@/lib/context'
import { ContextIndicator } from './ContextIndicator'

interface ComposerProps {
  disabled?: boolean
  think: ThinkLevel
  onThinkChange: (level: ThinkLevel) => void
  model: string
  onModelChange: (model: string) => void
  systemPrompt: string
  onSystemPromptChange: (prompt: string) => void
  contextUsage: ContextUsage
  onSend: (text: string) => void
}

export function Composer({
  disabled,
  think,
  onThinkChange,
  model,
  onModelChange,
  systemPrompt,
  onSystemPromptChange,
  contextUsage,
  onSend,
}: ComposerProps) {
  const [text, setText] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value || disabled) return
    setText('')
    onSend(value)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit(event)
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-bar">
        <ContextIndicator usage={contextUsage} />
        <button type="button" className="settings-toggle" onClick={() => setShowSettings((s) => !s)}>
          Settings
        </button>
      </div>

      {showSettings && (
        <div className="settings-panel">
          <label>
            <span>Model</span>
            <input value={model} onChange={(e) => onModelChange(e.target.value)} />
          </label>
          <label>
            <span>Thinking</span>
            <select value={think} onChange={(e) => onThinkChange(e.target.value as ThinkLevel)}>
              <option value="off">Off</option>
              <option value="auto">Auto</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            <span>System prompt</span>
            <textarea rows={4} value={systemPrompt} onChange={(e) => onSystemPromptChange(e.target.value)} />
          </label>
        </div>
      )}

      <div className="composer-row">
        <textarea
          className="composer-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for a new line)"
          rows={2}
          disabled={disabled}
        />
        <button type="submit" disabled={disabled || !text.trim()}>
          Send
        </button>
      </div>
    </form>
  )
}
