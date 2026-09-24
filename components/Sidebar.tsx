'use client'
import type { ConversationMeta } from '@/lib/types'

interface SidebarProps {
  conversations: ConversationMeta[]
  archived: ConversationMeta[]
  activeId: string | null
  showArchived: boolean
  onNew: () => void
  onSelect: (id: string) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onDelete: (id: string) => void
  onToggleArchived: () => void
}

export function Sidebar({
  conversations,
  archived,
  activeId,
  showArchived,
  onNew,
  onSelect,
  onArchive,
  onUnarchive,
  onDelete,
  onToggleArchived,
}: SidebarProps) {
  const list = showArchived ? archived : conversations

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="new-convo" onClick={onNew}>
          + New conversation
        </button>
      </div>

      <button className="archive-toggle" onClick={onToggleArchived}>
        {showArchived ? 'Back to conversations' : 'Archived'}
      </button>

      <ul className="conversation-list">
        {list.map((conversation) => (
          <li key={conversation.id} className={conversation.id === activeId ? 'active' : ''}>
            <button
              className="conversation-item"
              onClick={() => onSelect(conversation.id)}
              title={conversation.title}
            >
              {conversation.title}
            </button>
            <div className="conversation-actions">
              {showArchived ? (
                <button onClick={() => onUnarchive(conversation.id)} title="Unarchive" aria-label="Unarchive">
                  ↩
                </button>
              ) : (
                <button onClick={() => onArchive(conversation.id)} title="Archive" aria-label="Archive">
                  ▸
                </button>
              )}
              <button onClick={() => onDelete(conversation.id)} title="Delete" aria-label="Delete">
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      {list.length === 0 && (
        <p className="empty">{showArchived ? 'No archived conversations' : 'No conversations yet'}</p>
      )}
    </aside>
  )
}
