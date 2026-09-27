import { promises as fs } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { ConversationStore, titleFromContent } from '@/lib/storage'
import type { Conversation } from '@/types'

let baseDir: string
let store: ConversationStore

beforeEach(async () => {
  baseDir = await mkdtemp(path.join(tmpdir(), 'bigcode-storage-'))
  store = new ConversationStore(baseDir)
  await store.init()
})

describe('ConversationStore.create', () => {
  it('creates a conversation file with defaults', async () => {
    const conversation = await store.create({ model: 'm:cloud', systemPrompt: 'You are…' })
    expect(conversation.id).toMatch(/^[a-f0-9]{32}$/)
    expect(conversation.title).toBe('New conversation')
    expect(conversation.model).toBe('m:cloud')
    expect(conversation.messages).toEqual([])
    expect(conversation.created_at).toBe(conversation.updated_at)

    const raw = JSON.parse(
      await fs.readFile(path.join(baseDir, 'conversations', `${conversation.id}.json`), 'utf-8'),
    ) as Conversation
    expect(raw.system_prompt).toBe('You are…')
  })
})

describe('ConversationStore.list', () => {
  it('lists conversations most recently updated first', async () => {
    const a = await store.create({ model: 'm', systemPrompt: 'p' })
    const b = await store.create({ model: 'm', systemPrompt: 'p' })
    await store.appendMessages(a.id, [{ role: 'user', content: 'hello' }], { title: 'hello' })
    const list = await store.list()
    expect(list.map((c) => c.id)).toEqual([a.id, b.id])
    expect(list[0].title).toBe('hello')
  })

  it('skips corrupt files instead of failing', async () => {
    await fs.writeFile(path.join(baseDir, 'conversations', 'broken.json'), '{not json')
    const list = await store.list()
    expect(list).toEqual([])
  })
})

describe('ConversationStore.get', () => {
  it('returns null for missing conversations', async () => {
    expect(await store.get('a'.repeat(32))).toBeNull()
  })

  it('treats invalid ids (path traversal) as not found, without touching the fs', async () => {
    expect(await store.get('../../etc/passwd')).toBeNull()
    expect(await store.get('')).toBeNull()
    expect(await store.archive('../../etc/passwd')).toBeNull()
    expect(await store.unarchive('../../etc/passwd')).toBeNull()
    expect(await store.update('../../etc/passwd', { title: 'x' })).toBeNull()
  })
})

describe('ConversationStore.update', () => {
  it('patches title and system prompt', async () => {
    const conversation = await store.create({ model: 'm', systemPrompt: 'old' })
    const updated = await store.update(conversation.id, {
      title: 'Renamed',
      system_prompt: 'new prompt',
    })
    expect(updated?.title).toBe('Renamed')
    expect(updated?.system_prompt).toBe('new prompt')
    expect(await (await store.get(conversation.id))?.system_prompt).toBe('new prompt')
  })

  it('returns null for missing conversations', async () => {
    expect(await store.update('b'.repeat(32), { title: 'x' })).toBeNull()
  })
})

describe('ConversationStore.appendMessages', () => {
  it('appends messages and bumps updated_at', async () => {
    const conversation = await store.create({ model: 'm', systemPrompt: 'p' })
    const before = conversation.updated_at
    const updated = await store.appendMessages(conversation.id, [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
    expect(updated?.messages.map((m) => m.content)).toEqual(['hi', 'hello'])
    expect(updated!.updated_at >= before).toBe(true)
  })

  it('retitles untitled conversations from the provided title', async () => {
    const conversation = await store.create({ model: 'm', systemPrompt: 'p' })
    const updated = await store.appendMessages(conversation.id, [{ role: 'user', content: 'hi' }], {
      title: 'My topic',
    })
    expect(updated?.title).toBe('My topic')

    // Already-titled conversations keep their title.
    const again = await store.appendMessages(conversation.id, [{ role: 'user', content: 'again' }], {
      title: 'Ignored',
    })
    expect(again?.title).toBe('My topic')
  })
})

describe('ConversationStore archive', () => {
  it('moves the conversation file to archive/ and back', async () => {
    const conversation = await store.create({ model: 'm', systemPrompt: 'p' })
    await store.appendMessages(conversation.id, [{ role: 'user', content: 'x' }])

    expect(await store.archive(conversation.id)).not.toBeNull()
    expect(await store.list()).toEqual([])
    const archived = await store.listArchived()
    expect(archived.map((c) => c.id)).toEqual([conversation.id])
    expect(
      await fs.access(path.join(baseDir, 'archive', `${conversation.id}.json`)),
    ).toBeUndefined()

    expect(await store.unarchive(conversation.id)).not.toBeNull()
    expect((await store.listArchived()).length).toBe(0)
    expect((await store.list()).map((c) => c.id)).toEqual([conversation.id])
  })

  it('returns null when archiving a missing conversation', async () => {
    expect(await store.archive('c'.repeat(32))).toBeNull()
    expect(await store.unarchive('c'.repeat(32))).toBeNull()
  })
})

describe('titleFromContent', () => {
  it('uses the first line as-is when short', () => {
    expect(titleFromContent('Hello there\nsecond line')).toBe('Hello there')
  })

  it('truncates long content with an ellipsis', () => {
    const title = titleFromContent('x'.repeat(120))
    expect(title.length).toBe(50)
    expect(title.endsWith('…')).toBe(true)
  })
})