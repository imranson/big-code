'use client'

import { useEffect, useRef, useState } from 'react'

import Composer from '@/components/Composer'
import ContextMeter from '@/components/ContextMeter'
import MessageItem from '@/components/MessageItem'
import Sidebar from '@/components/Sidebar'
import { contextUsage, estimateConversationTokens } from '@/lib/context-window'
import { readEventStream } from '@/lib/stream-client'
import type { ChatMessage, Conversation, ConversationMeta, StreamEvent } from '@/types'

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Request failed with status ${response.status}`)
  }
  return (await response.json()) as T
}

function updateLastDraft(
  draft: ChatMessage[],
  update: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  if (draft.length === 0) {
    draft = [{ role: 'assistant', content: '' }]
  }
  const next = [...draft]
  next[next.length - 1] = update(next[next.length - 1])
  return next
}

export interface ChatViewProps {
  defaultModel: string
  contextWindow: number
}

export default function ChatView({ defaultModel, contextWindow }: ChatViewProps) {
  const [conversations, setConversations] = useState<ConversationMeta[]>([])
  const [archived, setArchived] = useState<ConversationMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState('New conversation')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [systemPrompt, setSystemPrompt] = useState('')
  const [draft, setDraft] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [input, setInput] = useState('')
  const [think, setThink] = useState(false)
  const [tools, setTools] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  async function refreshLists(): Promise<{ list: ConversationMeta[]; archived: ConversationMeta[] }> {
    const [list, archiveList] = await Promise.all([
      api<{ conversations: ConversationMeta[] }>('/api/conversations'),
      api<{ conversations: ConversationMeta[] }>('/api/archive'),
    ])
    setConversations(list.conversations)
    setArchived(archiveList.conversations)
    return { list: list.conversations, archived: archiveList.conversations }
  }

  function applyConversation(conversation: Conversation) {
    setActiveId(conversation.id)
    setTitle(conversation.title)
    setMessages(conversation.messages)
    setSystemPrompt(conversation.system_prompt)
    setPromptDraft(conversation.system_prompt)
    setDraft([])
  }

  async function selectConversation(id: string) {
    setError(null)
    try {
      const conversation = await api<Conversation>(`/api/conversations/${id}`)
      applyConversation(conversation)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function newConversation() {
    setError(null)
    try {
      const conversation = await api<Conversation>('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: defaultModel }),
      })
      await refreshLists()
      applyConversation(conversation)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  function handleEvent(event: StreamEvent) {
    switch (event.type) {
      case 'round_start':
        setDraft((prev) => [...prev, { role: 'assistant', content: '' }])
        break
      case 'thinking':
        setDraft((prev) =>
          updateLastDraft(prev, (message) => ({
            ...message,
            thinking: (message.thinking ?? '') + event.content,
          })),
        )
        break
      case 'content':
        setDraft((prev) =>
          updateLastDraft(prev, (message) => ({
            ...message,
            content: message.content + event.content,
          })),
        )
        break
      case 'tool_calls':
        setDraft((prev) => updateLastDraft(prev, (message) => ({ ...message, tool_calls: event.tool_calls })))
        break
      case 'tool_result':
        setDraft((prev) => [
          ...prev,
          { role: 'tool', content: event.content, tool_name: event.tool_name },
        ])
        break
      case 'assistant':
        break
      case 'usage':
        break
      case 'done':
        setTitle(event.conversation.title)
        setMessages(event.conversation.messages)
        setDraft([])
        break
      case 'error':
        setError(event.message)
        break
    }
  }

  async function send() {
    const content = input.trim()
    if (!content || streaming || !activeId) return
    setError(null)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content }])
    setDraft([])
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, content, think, tools }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Chat failed with status ${response.status}`)
      }
      await readEventStream(response, handleEvent)
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
      // Draft messages that never got a 'done' (error/abort) stay visible; the
      // sidebar ordering/titles may have changed on the server.
      refreshLists().catch(() => {})
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  async function archiveConversation(id: string) {
    setError(null)
    try {
      await api(`/api/conversations/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      })
      const { list } = await refreshLists()
      if (id === activeId) {
        if (list.length > 0) await selectConversation(list[0].id)
        else await newConversation()
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function unarchiveConversation(id: string) {
    setError(null)
    try {
      await api(`/api/conversations/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unarchive' }),
      })
      await refreshLists()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function saveSystemPrompt() {
    if (!activeId) return
    setError(null)
    try {
      const conversation = await api<Conversation>(`/api/conversations/${activeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_prompt: promptDraft }),
      })
      setSystemPrompt(conversation.system_prompt)
      setPromptOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  // Load history on mount; create a first conversation when there is none.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { list } = await refreshLists()
        if (cancelled) return
        if (list.length > 0) await selectConversation(list[0].id)
        else await newConversation()
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
      }
    })()
    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the view pinned to the newest content while streaming.
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages.length, draft.length, draft[draft.length - 1]?.content])

  const pendingInput: ChatMessage[] = input.trim() ? [{ role: 'user', content: input.trim() }] : []
  const usage = contextUsage(
    estimateConversationTokens([...messages, ...draft, ...pendingInput], systemPrompt),
    contextWindow,
  )

  const allMessages = streaming ? messages : [...messages, ...draft]

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        archived={archived}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={newConversation}
        onArchive={archiveConversation}
        onUnarchive={unarchiveConversation}
      />
      <main className="chat">
        <header className="chat-header">
          <div className="chat-header-left">
            <h2 className="chat-title">{title}</h2>
            <span className="chat-subtitle">{defaultModel}</span>
            <button className="link-button" onClick={() => setPromptOpen(!promptOpen)}>
              {promptOpen ? 'Hide system prompt' : 'System prompt'}
            </button>
          </div>
          <ContextMeter usage={usage} />
        </header>

        {promptOpen ? (
          <div className="system-prompt-editor" data-testid="system-prompt-editor">
            <textarea
              value={promptDraft}
              onChange={(event) => setPromptDraft(event.target.value)}
              aria-label="System prompt"
            />
            <div className="composer-actions">
              <button className="send-button" onClick={saveSystemPrompt} disabled={!activeId}>
                Save system prompt
              </button>
            </div>
          </div>
        ) : null}

        <div className="messages">
          <div className="messages-inner">
            {allMessages.length === 0 && draft.length === 0 ? (
              <div className="empty-state">
                <h2>Say hello</h2>
                <p>Ask anything. Enable web tools for search, page fetches and the current datetime.</p>
              </div>
            ) : null}
            {allMessages.map((message, index) => (
              <MessageItem key={index} message={message} />
            ))}
            {streaming
              ? draft.map((message, index) => (
                  <MessageItem key={`draft-${index}`} message={message} streaming />
                ))
              : null}
            <div ref={bottomRef} />
          </div>
          {error ? (
            <div className="messages-inner">
              <div className="error-banner" role="alert" data-testid="error-banner">
                {error}
              </div>
            </div>
          ) : null}
        </div>

        <Composer
          value={input}
          onChange={setInput}
          onSend={() => void send()}
          onStop={stop}
          think={think}
          onThinkChange={setThink}
          tools={tools}
          onToolsChange={setTools}
          streaming={streaming}
        />
      </main>
    </div>
  )
}