import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import type { ChatMessage, Conversation, ConversationMeta } from '@/types'

// Existing conversation ids are 32 hex chars; keep the same shape.
const ID_PATTERN = /^[a-f0-9]{32}$/

/**
 * True when the id could name a stored conversation. Anything else (wrong
 * shape, path fragments) is treated as "not found" rather than an error, and
 * never reaches the filesystem.
 */
function isValidId(id: string): boolean {
  return ID_PATTERN.test(id)
}

function nowIso(): string {
  return new Date().toISOString()
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir)
  } catch {
    return []
  }
}

/**
 * File-backed conversation storage. Conversations live as JSON files under
 * `<baseDir>/conversations/` and archived ones under `<baseDir>/archive/`.
 */
export class ConversationStore {
  readonly conversationsDir: string
  readonly archiveDir: string

  constructor(readonly baseDir: string) {
    this.conversationsDir = path.join(baseDir, 'conversations')
    this.archiveDir = path.join(baseDir, 'archive')
  }

  private filePath(id: string, archived = false): string {
    return path.join(archived ? this.archiveDir : this.conversationsDir, `${id}.json`)
  }

  async init(): Promise<void> {
    await fs.mkdir(this.conversationsDir, { recursive: true })
    await fs.mkdir(this.archiveDir, { recursive: true })
  }

  private async write(conversation: Conversation, archived = false): Promise<void> {
    const target = this.filePath(conversation.id, archived)
    const tmp = `${target}.tmp`
    await fs.writeFile(tmp, JSON.stringify(conversation, null, 2), 'utf-8')
    await fs.rename(tmp, target)
  }

  private async readDirMeta(dir: string): Promise<ConversationMeta[]> {
    const metas: ConversationMeta[] = []
    for (const entry of await listDir(dir)) {
      if (!entry.endsWith('.json') || entry.endsWith('.tmp')) continue
      try {
        const raw = JSON.parse(await fs.readFile(path.join(dir, entry), 'utf-8'))
        // Corrupt or foreign files are skipped rather than crashing the listing.
        if (typeof raw?.id !== 'string' || !Array.isArray(raw?.messages)) continue
        const { messages: _messages, ...meta } = raw as Conversation
        metas.push(meta)
      } catch {
        // Unreadable/corrupt file: skip it.
      }
    }
    metas.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    return metas
  }

  /** Lists active conversations, most recently updated first. */
  async list(): Promise<ConversationMeta[]> {
    return this.readDirMeta(this.conversationsDir)
  }

  /** Lists archived conversations, most recently updated first. */
  async listArchived(): Promise<ConversationMeta[]> {
    return this.readDirMeta(this.archiveDir)
  }

  /** Loads one conversation (active or archived). Returns null if absent. */
  async get(id: string): Promise<Conversation | null> {
    if (!isValidId(id)) return null
    for (const archived of [false, true]) {
      try {
        const raw = JSON.parse(await fs.readFile(this.filePath(id, archived), 'utf-8'))
        if (typeof raw?.id === 'string') return raw as Conversation
      } catch {
        // Not found in this folder; try the other one.
      }
    }
    return null
  }

  /** Creates a new conversation with no messages. */
  async create(input: { model: string; systemPrompt: string; title?: string }): Promise<Conversation> {
    await this.init()
    const now = nowIso()
    const conversation: Conversation = {
      id: randomUUID().replace(/-/g, ''),
      title: input.title ?? 'New conversation',
      model: input.model,
      system_prompt: input.systemPrompt,
      created_at: now,
      updated_at: now,
      messages: [],
    }
    await this.write(conversation)
    return conversation
  }

  /** Patches top-level fields (title, system prompt, model). */
  async update(
    id: string,
    patch: { title?: string; system_prompt?: string; model?: string },
  ): Promise<Conversation | null> {
    const conversation = await this.get(id)
    if (!conversation) return null
    if (patch.title !== undefined) conversation.title = patch.title
    if (patch.system_prompt !== undefined) conversation.system_prompt = patch.system_prompt
    if (patch.model !== undefined) conversation.model = patch.model
    conversation.updated_at = nowIso()
    await this.write(conversation)
    return conversation
  }

  /**
   * Appends messages to a conversation, optionally retitling it (used to name
   * a conversation after the user's first message).
   */
  async appendMessages(
    id: string,
    messages: ChatMessage[],
    options?: { title?: string },
  ): Promise<Conversation | null> {
    const conversation = await this.get(id)
    if (!conversation) return null
    conversation.messages.push(...messages)
    if (options?.title !== undefined && conversation.title === 'New conversation') {
      conversation.title = options.title
    }
    conversation.updated_at = nowIso()
    await this.write(conversation)
    return conversation
  }

  private async move(id: string, toArchive: boolean): Promise<Conversation | null> {
    if (!isValidId(id)) return null
    await this.init()
    const source = this.filePath(id, !toArchive)
    const target = this.filePath(id, toArchive)
    try {
      await fs.rename(source, target)
    } catch {
      return null
    }
    return this.get(id)
  }

  /** Moves a conversation to the archive folder. Returns null if absent. */
  async archive(id: string): Promise<Conversation | null> {
    return this.move(id, true)
  }

  /** Moves an archived conversation back to the active folder. */
  async unarchive(id: string): Promise<Conversation | null> {
    return this.move(id, false)
  }
}

/** Truncates a user message into a human-readable conversation title. */
export function titleFromContent(content: string, maxLength = 50): string {
  const firstLine = content.trim().split('\n')[0] ?? ''
  if (firstLine.length <= maxLength) return firstLine
  return `${firstLine.slice(0, maxLength - 1)}…`
}