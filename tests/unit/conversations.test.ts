import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConversationStore, deriveTitle } from '@/lib/conversations'

let dir: string
let store: ConversationStore

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'conversations-'))
  store = new ConversationStore(dir)
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('deriveTitle', () => {
  it('uses the first user message', () => {
    expect(deriveTitle([{ role: 'user', content: 'what is the date?' }])).toBe('what is the date?')
  })
  it('falls back when there is no user message', () => {
    expect(deriveTitle([{ role: 'assistant', content: 'hi' }])).toBe('New conversation')
  })
  it('truncates long messages', () => {
    const long = 'a'.repeat(100)
    expect(deriveTitle([{ role: 'user', content: long }]).length).toBeLessThanOrEqual(60)
  })
})

describe('ConversationStore', () => {
  it('creates and lists conversations sorted by updated_at desc', async () => {
    const a = await store.create({ title: 'A' })
    const b = await store.create({ title: 'B' })
    const list = await store.list()
    expect(list.map((c) => c.id)).toContain(a.id)
    expect(list.map((c) => c.id)).toContain(b.id)
    // b was created last, so it should come first
    expect(list[0].id).toBe(b.id)
  })

  it('persists to disk with the expected shape', async () => {
    const created = await store.create({ title: 'Persist', model: 'm', systemPrompt: 'sys' })
    const raw = JSON.parse(await readFile(join(store.conversationsDir, `${created.id}.json`), 'utf-8'))
    expect(raw).toMatchObject({ id: created.id, title: 'Persist', model: 'm', system_prompt: 'sys' })
    expect(raw.messages).toEqual([])
  })

  it('saves messages and updates updated_at', async () => {
    const created = await store.create({ title: 'Save' })
    const updated = await store.save({
      ...created,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(updated.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(updated.updated_at >= created.updated_at).toBe(true)

    const fetched = await store.get(created.id)
    expect(fetched?.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('archives a conversation by moving the file to the archive folder', async () => {
    const created = await store.create({ title: 'Archive me' })
    await store.archive(created.id)

    expect(await store.get(created.id)).not.toBeNull()
    expect(await store.list()).not.toContainEqual(expect.objectContaining({ id: created.id }))
    expect(await store.listArchived()).toContainEqual(expect.objectContaining({ id: created.id }))
    await expect(readFile(join(store.conversationsDir, `${created.id}.json`), 'utf-8')).rejects.toThrow()
    await expect(readFile(join(store.archiveDir, `${created.id}.json`), 'utf-8')).resolves.toBeTruthy()
  })

  it('unarchives a conversation back into the active folder', async () => {
    const created = await store.create({ title: 'Unarchive me' })
    await store.archive(created.id)
    await store.unarchive(created.id)
    expect(await store.list()).toContainEqual(expect.objectContaining({ id: created.id }))
    expect(await store.listArchived()).not.toContainEqual(expect.objectContaining({ id: created.id }))
  })

  it('removes a conversation from either folder', async () => {
    const active = await store.create({ title: 'Delete active' })
    const archived = await store.create({ title: 'Delete archived' })
    await store.archive(archived.id)

    await store.remove(active.id)
    await store.remove(archived.id)

    expect(await store.get(active.id)).toBeNull()
    expect(await store.get(archived.id)).toBeNull()
    const allFiles = [
      ...(await readdir(store.conversationsDir)),
      ...(await readdir(store.archiveDir)),
    ]
    expect(allFiles).not.toContain(`${active.id}.json`)
    expect(allFiles).not.toContain(`${archived.id}.json`)
  })
})
