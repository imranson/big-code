'use client'

import type { ConversationMeta } from '@/types'

export interface SidebarProps {
  conversations: ConversationMeta[]
  archived: ConversationMeta[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Conversation list sidebar: history, new-conversation button, archive. */
export default function Sidebar({
  conversations,
  archived,
  activeId,
  onSelect,
  onNew,
  onArchive,
  onUnarchive,
}: SidebarProps) {
  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">Ollama Chat</h1>
        <button className="new-conversation-button" onClick={onNew}>
          + New conversation
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Conversations</div>
        {conversations.length === 0 ? (
          <div className="sidebar-empty">No conversations yet</div>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`conversation-item${conversation.id === activeId ? ' active' : ''}`}
              onClick={() => onSelect(conversation.id)}
              data-testid={`conversation-${conversation.id}`}
            >
              <span className="conversation-item-title">{conversation.title}</span>
              <span className="sidebar-empty">{formatDate(conversation.updated_at)}</span>
              <button
                className="conversation-item-action"
                title="Archive conversation"
                aria-label={`Archive ${conversation.title}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onArchive(conversation.id)
                }}
              >
                📥
              </button>
            </div>
          ))
        )}
      </div>

      {archived.length > 0 ? (
        <div className="sidebar-section">
          <div className="sidebar-section-label">Archived</div>
          {archived.map((conversation) => (
            <div
              key={conversation.id}
              className="conversation-item"
              data-testid={`archived-${conversation.id}`}
            >
              <span className="conversation-item-title">{conversation.title}</span>
              <button
                className="conversation-item-action"
                title="Move back to conversations"
                aria-label={`Restore ${conversation.title}`}
                style={{ visibility: 'visible' }}
                onClick={() => onUnarchive(conversation.id)}
              >
                ↩
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  )
}