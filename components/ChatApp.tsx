'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sidebar } from './Sidebar'
import { MessageItem } from './MessageItem'
import { Composer } from './Composer'
import { streamChat } from '@/lib/client'
import {
  applyEvent,
  messagesToTranscript,
  transcriptToText,
  type TranscriptNode,
} from '@/lib/transcript'
import { estimateContextUsage } from '@/lib/context'
import { buildSystemPrompt } from '@/lib/systemPrompt'
import { getTools } from '@/lib/tools'
import { DEFAULT_MODEL, DEFAULT_CONTEXT_WINDOW } from '@/lib/config'
import type { AgentEvent } from '@/lib/agent'
import type { Conversation, ConversationMeta, ThinkLevel, ChatMessage } from '@/lib/types'

export default function ChatApp() {
  const [conversations, setConversations] = useState<ConversationMeta[]>([])
  const [archived, setArchived] = useState<ConversationMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [contextWindow, setContextWindow] = useState(DEFAULT_CONTEXT_WINDOW)
  const [think, setThink] = useState<ThinkLevel>('off')
  const [systemPrompt, setSystemPrompt] = useState(() =>
    buildSystemPrompt({ model: DEFAULT_MODEL, tools: getTools() }),
  )
  const [transcript, setTranscript] = useState<TranscriptNode[]>([])
  const [streaming, setStreaming] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const abortRef = useRef<(() => void) | null>(null)

  const refreshLists = useCallback(async () => {
    const [activeRes, archivedRes] = await Promise.all([
      fetch('/api/conversations'),
      fetch('/api/conversations?archived=true'),
    ])
    const activeData = await activeRes.json()
    const archivedData = await archivedRes.json()
    setConversations(activeData.conversations ?? [])
    setArchived(archivedData.conversations ?? [])
  }, [])

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((cfg) => {
        if (cfg.model) setModel(cfg.model)
        if (cfg.contextWindow) setContextWindow(cfg.contextWindow)
      })
      .catch(() => {})
    refreshLists()
  }, [refreshLists])

  const loadConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`)
    if (!res.ok) return
    const data = await res.json()
    const convo: Conversation = data.conversation
    setConversation(convo)
    setActiveId(id)
    setModel(convo.model)
    setSystemPrompt(convo.system_prompt || systemPrompt)
    setTranscript(messagesToTranscript(convo.messages))
  }, [systemPrompt])

  const newConversation = useCallback(async () => {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    })
    const data = await res.json()
    const convo: Conversation = data.conversation
    setConversation(convo)
    setActiveId(convo.id)
    setSystemPrompt(convo.system_prompt || systemPrompt)
    setTranscript([])
    await refreshLists()
  }, [model, systemPrompt, refreshLists])

  const send = useCallback(
    async (text: string) => {
      if (streaming) return
      const userMessage: ChatMessage = { role: 'user', content: text }
      const prevMessages: ChatMessage[] = conversation?.messages ?? []
      const newMessages = [...prevMessages, userMessage]

      let conversationId = activeId
      if (!conversationId) {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, systemPrompt }),
        })
        const data = (await res.json()) as { conversation: Conversation }
        conversationId = data.conversation.id
        setConversation(data.conversation)
        setActiveId(conversationId)
        await refreshLists()
      }

      setTranscript(messagesToTranscript(newMessages))
      setStreaming(true)

      try {
        const handle = await streamChat(
          { conversationId, model, systemPrompt, think, messages: newMessages },
          (event: AgentEvent) => {
            if (event.type === 'done') {
              setConversation((current) => (current ? { ...current, messages: event.messages } : current))
              setTranscript(messagesToTranscript(event.messages))
            } else {
              setTranscript((current) => applyEvent(current, event))
            }
          },
        )
        abortRef.current = handle.abort
        await handle.done
      } catch (error) {
        setTranscript((current) => [
          ...current,
          { kind: 'error', content: error instanceof Error ? error.message : String(error) },
        ])
      } finally {
        setStreaming(false)
        abortRef.current = null
        refreshLists()
      }
    },
    [activeId, conversation, model, systemPrompt, think, streaming, refreshLists],
  )

  const archive = useCallback(
    async (id: string) => {
      await fetch(`/api/conversations/${id}/archive`, { method: 'POST' })
      if (activeId === id) {
        setConversation(null)
        setActiveId(null)
        setTranscript([])
      }
      await refreshLists()
    },
    [activeId, refreshLists],
  )

  const unarchive = useCallback(
    async (id: string) => {
      await fetch(`/api/conversations/${id}/unarchive`, { method: 'POST' })
      await refreshLists()
    },
    [refreshLists],
  )

  const deleteConversation = useCallback(
    async (id: string) => {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (activeId === id) {
        setConversation(null)
        setActiveId(null)
        setTranscript([])
      }
      await refreshLists()
    },
    [activeId, refreshLists],
  )

  const contextUsage = useMemo(
    () =>
      estimateContextUsage({
        text: `${systemPrompt}\n${transcriptToText(transcript)}`,
        contextWindow,
      }),
    [systemPrompt, transcript, contextWindow],
  )

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        archived={archived}
        activeId={activeId}
        showArchived={showArchived}
        onNew={newConversation}
        onSelect={loadConversation}
        onArchive={archive}
        onUnarchive={unarchive}
        onDelete={deleteConversation}
        onToggleArchived={() => setShowArchived((s) => !s)}
      />
      <main className="main">
        <header className="main-header">
          <h1>{conversation?.title ?? 'Assistant'}</h1>
        </header>
        <div className="messages" role="log" aria-live="polite">
          {transcript.length === 0 && <p className="empty">Start a conversation</p>}
          {transcript.map((node, index) => (
            <MessageItem key={index} node={node} />
          ))}
        </div>
        <Composer
          disabled={streaming}
          think={think}
          onThinkChange={setThink}
          model={model}
          onModelChange={setModel}
          systemPrompt={systemPrompt}
          onSystemPromptChange={setSystemPrompt}
          contextUsage={contextUsage}
          onSend={send}
        />
      </main>
    </div>
  )
}
