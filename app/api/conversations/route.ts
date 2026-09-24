import type { NextRequest } from 'next/server'
import { getStore } from '@/lib/conversations'
import { getTools } from '@/lib/tools'
import { buildSystemPrompt } from '@/lib/systemPrompt'
import { DEFAULT_MODEL } from '@/lib/config'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const archived = req.nextUrl.searchParams.get('archived') === 'true'
  const store = getStore()
  const conversations = archived ? await store.listArchived() : await store.list()
  return Response.json({ conversations })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    model?: string
    systemPrompt?: string
  }
  const model = body.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL
  const systemPrompt = body.systemPrompt ?? buildSystemPrompt({ model, tools: getTools() })
  const conversation = await getStore().create({
    title: body.title ?? 'New conversation',
    model,
    systemPrompt,
  })
  return Response.json({ conversation }, { status: 201 })
}
