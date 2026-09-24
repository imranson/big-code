import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({ dir: '' as string }))

vi.mock('@/lib/conversations', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/conversations')>()
  return { ...mod, getStore: () => new mod.ConversationStore(state.dir) }
})

import { GET as listGET, POST as listPOST } from '@/app/api/conversations/route'
import { GET, PATCH, DELETE } from '@/app/api/conversations/[id]/route'
import { POST as archivePOST } from '@/app/api/conversations/[id]/archive/route'
import { POST as unarchivePOST } from '@/app/api/conversations/[id]/unarchive/route'

beforeAll(async () => {
  state.dir = await mkdtemp(join(tmpdir(), 'convo-api-'))
})

afterAll(async () => {
  await rm(state.dir, { recursive: true, force: true })
})

function request(url: string, opts?: { method?: string; body?: unknown }): NextRequest {
  const searchParams = new URLSearchParams(url.split('?')[1] ?? '')
  return {
    nextUrl: { searchParams },
    json: async () => opts?.body ?? {},
  } as unknown as NextRequest
}

describe('conversations API', () => {
  it('creates a conversation and lists it', async () => {
    const created = await listPOST(request('http://localhost/api/conversations', { body: { model: 'm' } }))
    expect(created.status).toBe(201)
    const { conversation } = await created.json()
    expect(conversation.id).toBeTruthy()
    expect(conversation.title).toBe('New conversation')

    const list = await listGET(request('http://localhost/api/conversations'))
    const { conversations } = await list.json()
    expect(conversations.map((c: { id: string }) => c.id)).toContain(conversation.id)
  })

  it('sets a default system prompt parameterized by the model and tools', async () => {
    const created = await listPOST(request('http://localhost/api/conversations', { body: { model: 'gpt-oss:120b' } }))
    const { conversation } = await created.json()
    expect(conversation.system_prompt).toContain('gpt-oss:120b')
    expect(conversation.system_prompt).toContain('web_search')
  })

  it('fetches a single conversation and returns 404 when missing', async () => {
    const created = await listPOST(request('http://localhost/api/conversations', { body: {} }))
    const { conversation } = await created.json()

    const found = await GET(request('http://localhost/x'), { params: Promise.resolve({ id: conversation.id }) } as never)
    expect(found.status).toBe(200)
    expect((await found.json()).conversation.id).toBe(conversation.id)

    const missing = await GET(request('http://localhost/x'), { params: Promise.resolve({ id: 'nope' }) } as never)
    expect(missing.status).toBe(404)
  })

  it('updates a conversation via PATCH', async () => {
    const created = await listPOST(request('http://localhost/api/conversations', { body: { title: 'before' } }))
    const { conversation } = await created.json()

    const patched = await PATCH(
      request('http://localhost/x', { body: { title: 'after', model: 'm2' } }),
      { params: Promise.resolve({ id: conversation.id }) } as never,
    )
    const updated = (await patched.json()).conversation
    expect(updated.title).toBe('after')
    expect(updated.model).toBe('m2')
  })

  it('archives and unarchives a conversation', async () => {
    const created = await listPOST(request('http://localhost/api/conversations', { body: {} }))
    const { conversation } = await created.json()

    await archivePOST(request('http://localhost/x'), { params: Promise.resolve({ id: conversation.id }) } as never)

    const active = await listGET(request('http://localhost/api/conversations'))
    expect((await active.json()).conversations.map((c: { id: string }) => c.id)).not.toContain(conversation.id)

    const archived = await listGET(request('http://localhost/api/conversations?archived=true'))
    expect((await archived.json()).conversations.map((c: { id: string }) => c.id)).toContain(conversation.id)

    await unarchivePOST(request('http://localhost/x'), { params: Promise.resolve({ id: conversation.id }) } as never)
    const back = await listGET(request('http://localhost/api/conversations'))
    expect((await back.json()).conversations.map((c: { id: string }) => c.id)).toContain(conversation.id)
  })

  it('deletes a conversation', async () => {
    const created = await listPOST(request('http://localhost/api/conversations', { body: {} }))
    const { conversation } = await created.json()

    await DELETE(request('http://localhost/x'), { params: Promise.resolve({ id: conversation.id }) } as never)

    const missing = await GET(request('http://localhost/x'), { params: Promise.resolve({ id: conversation.id }) } as never)
    expect(missing.status).toBe(404)
  })
})
