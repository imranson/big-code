import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Conversation, ConversationMeta, ChatMessage } from './types'

export const CONVERSATIONS_DIR = 'conversations'
export const ARCHIVE_DIR = 'archive'

function toMeta(conversation: Conversation): ConversationMeta {
  return {
    id: conversation.id,
    title: conversation.title,
    model: conversation.model,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
  }
}

function sortByUpdated(messages: ConversationMeta[]): ConversationMeta[] {
  return messages.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

/** Title a conversation from its first user message. */
export function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')
  const text = (first?.content ?? '').trim().replace(/\s+/g, ' ')
  if (!text) return 'New conversation'
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

/**
 * File-based conversation store. Conversations live as JSON files under
 * `<baseDir>/conversations/` and are moved to `<baseDir>/archive/` when archived.
 */
export class ConversationStore {
  constructor(private baseDir: string = process.env.DATA_DIR ?? 'data') {}

  get conversationsDir(): string {
    return join(this.baseDir, CONVERSATIONS_DIR)
  }

  get archiveDir(): string {
    return join(this.baseDir, ARCHIVE_DIR)
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.conversationsDir, { recursive: true })
    await fs.mkdir(this.archiveDir, { recursive: true })
  }

  private async readAll(dir: string): Promise<Conversation[]> {
    await this.ensureDirs()
    const entries = await fs.readdir(dir)
    const conversations: Conversation[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      try {
        const raw = await fs.readFile(join(dir, entry), 'utf-8')
        conversations.push(JSON.parse(raw) as Conversation)
      } catch {
        // Skip unreadable files rather than failing the whole list.
      }
    }
    return conversations
  }

  async list(): Promise<ConversationMeta[]> {
    const conversations = await this.readAll(this.conversationsDir)
    return sortByUpdated(conversations.map(toMeta))
  }

  async listArchived(): Promise<ConversationMeta[]> {
    const conversations = await this.readAll(this.archiveDir)
    return sortByUpdated(conversations.map(toMeta))
  }

  async get(id: string): Promise<Conversation | null> {
    await this.ensureDirs()
    for (const dir of [this.conversationsDir, this.archiveDir]) {
      try {
        const raw = await fs.readFile(join(dir, `${id}.json`), 'utf-8')
        return JSON.parse(raw) as Conversation
      } catch {
        // Not in this directory; try the other.
      }
    }
    return null
  }

  async create(input: {
    title?: string
    model?: string
    systemPrompt?: string
  }): Promise<Conversation> {
    await this.ensureDirs()
    const now = new Date().toISOString()
    const conversation: Conversation = {
      id: randomUUID().replace(/-/g, ''),
      title: input.title ?? 'New conversation',
      model: input.model ?? 'gpt-oss:120b',
      system_prompt: input.systemPrompt ?? '',
      created_at: now,
      updated_at: now,
      messages: [],
    }
    await this.write(conversation)
    return conversation
  }

  private async write(conversation: Conversation): Promise<void> {
    await this.ensureDirs()
    await fs.writeFile(
      join(this.conversationsDir, `${conversation.id}.json`),
      JSON.stringify(conversation, null, 2),
      'utf-8',
    )
  }

  async save(conversation: Conversation): Promise<Conversation> {
    const updated: Conversation = { ...conversation, updated_at: new Date().toISOString() }
    await this.write(updated)
    return updated
  }

  private async move(id: string, fromDir: string, toDir: string): Promise<Conversation> {
    await this.ensureDirs()
    const from = join(fromDir, `${id}.json`)
    const to = join(toDir, `${id}.json`)
    const raw = await fs.readFile(from, 'utf-8')
    const conversation = JSON.parse(raw) as Conversation
    conversation.updated_at = new Date().toISOString()
    await fs.writeFile(to, JSON.stringify(conversation, null, 2), 'utf-8')
    await fs.unlink(from)
    return conversation
  }

  async archive(id: string): Promise<Conversation> {
    return this.move(id, this.conversationsDir, this.archiveDir)
  }

  async unarchive(id: string): Promise<Conversation> {
    return this.move(id, this.archiveDir, this.conversationsDir)
  }

  async remove(id: string): Promise<void> {
    await this.ensureDirs()
    for (const dir of [this.conversationsDir, this.archiveDir]) {
      try {
        await fs.unlink(join(dir, `${id}.json`))
        return
      } catch {
        // Try the other directory.
      }
    }
  }
}

let store: ConversationStore | null = null

/** Lazily constructs the singleton so tests can change DATA_DIR before first use. */
export function getStore(): ConversationStore {
  if (!store) store = new ConversationStore()
  return store
}

/** Test helper: reset the singleton. */
export function resetStore(): void {
  store = null
}
