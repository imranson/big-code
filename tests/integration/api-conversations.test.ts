import { promises as fs } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  GET as listConversations,
  POST as createConversation,
} from '@/app/api/conversations/route'
import { GET as getConversation, PATCH as patchConversation } from '@/app/api/conversations/[id]/route'
import { POST as archiveConversation } from '@/app/api/conversations/[id]/archive/route'
import { GET as listArchive } from '@/app/api/archive/route'

let dataDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'bigcode-api-'))
  process.env.DATA_DIR = dataDir
  process.env.OLLAMA_MODEL = 'test-model:cloud'
})

function makeJsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/conversations', () => {
  it('creates a conversation with the default model and system prompt', async () => {
    const response = await createConversation(makeJsonRequest('http://localhost/api/conversations', 'POST', {}))
    expect(response.status).toBe(201)
    const conversation = await response.json()
    expect(conversation.model).toBe('test-model:cloud')
    expect(conversation.system_prompt).toContain('You are Assistant')
    expect(conversation.system_prompt).toContain('test-model:cloud')
    expect(conversation.title).toBe('New conversation')

    const onDisk = await fs.readdir(path.join(dataDir, 'conversations'))
    expect(onDisk).toEqual([`${conversation.id}.json`])
  })
})

describe('GET /api/conversations', () => {
  it('lists conversations newest first', async () => {
    const first = await (await createConversation(makeJsonRequest('http://x/api/conversations', 'POST', {}))).json()
    const second = await (await createConversation(makeJsonRequest('http://x/api/conversations', 'POST', {}))).json()
    await patchConversation(makeJsonRequest(`http://x/api/conversations/${first.id}`, 'PATCH', { title: 'bumped' }), params(first.id))

    const response = await listConversations()
    const { conversations } = await response.json()
    expect(conversations.map((c: { id: string }) => c.id)).toEqual([first.id, second.id])
    expect(conversations[0].title).toBe('bumped')
  })

  it('starts empty', async () => {
    const { conversations } = await (await listConversations()).json()
    expect(conversations).toEqual([])
  })
})

describe('GET /api/conversations/[id]', () => {
  it('returns the full conversation', async () => {
    const created = await (await createConversation(makeJsonRequest('http://x/api/conversations', 'POST', {}))).json()
    const response = await getConversation(new Request(`http://x/api/conversations/${created.id}`), params(created.id))
    expect(response.status).toBe(200)
    expect((await response.json()).id).toBe(created.id)
  })

  it('404s for unknown ids', async () => {
    const response = await getConversation(new Request('http://x/api/conversations/unknown'), params('unknown'))
    expect(response.status).toBe(404)
  })
})

describe('PATCH /api/conversations/[id]', () => {
  it('updates the system prompt', async () => {
    const created = await (await createConversation(makeJsonRequest('http://x/api/conversations', 'POST', {}))).json()
    const response = await patchConversation(
      makeJsonRequest(`http://x/api/conversations/${created.id}`, 'PATCH', { system_prompt: 'Custom prompt' }),
      params(created.id),
    )
    expect((await response.json()).system_prompt).toBe('Custom prompt')
  })

  it('rejects empty patches', async () => {
    const response = await patchConversation(
      makeJsonRequest('http://x/api/conversations/whatever', 'PATCH', {}),
      params('whatever'),
    )
    expect(response.status).toBe(400)
  })

  it('404s for unknown ids', async () => {
    const response = await patchConversation(
      makeJsonRequest(`http://x/api/conversations/${'a'.repeat(32)}`, 'PATCH', { title: 'x' }),
      params('a'.repeat(32)),
    )
    expect(response.status).toBe(404)
  })
})

describe('archive endpoints', () => {
  it('moves conversations to the archive folder and back', async () => {
    const created = await (await createConversation(makeJsonRequest('http://x/api/conversations', 'POST', {}))).json()

    const archiveResponse = await archiveConversation(
      makeJsonRequest(`http://x/api/conversations/${created.id}/archive`, 'POST', { action: 'archive' }),
      params(created.id),
    )
    expect(archiveResponse.status).toBe(200)
    expect(await fs.readdir(path.join(dataDir, 'conversations'))).toEqual([])
    expect(await fs.readdir(path.join(dataDir, 'archive'))).toEqual([`${created.id}.json`])

    const { conversations: archivedList } = await (await listArchive()).json()
    expect(archivedList.map((c: { id: string }) => c.id)).toEqual([created.id])
    const { conversations: activeList } = await (await listConversations()).json()
    expect(activeList).toEqual([])

    await archiveConversation(
      makeJsonRequest(`http://x/api/conversations/${created.id}/archive`, 'POST', { action: 'unarchive' }),
      params(created.id),
    )
    const { conversations: restored } = await (await listConversations()).json()
    expect(restored.map((c: { id: string }) => c.id)).toEqual([created.id])
  })

  it('404s when the conversation does not exist', async () => {
    const response = await archiveConversation(
      makeJsonRequest(`http://x/api/conversations/${'b'.repeat(32)}/archive`, 'POST', {}),
      params('b'.repeat(32)),
    )
    expect(response.status).toBe(404)
  })
})