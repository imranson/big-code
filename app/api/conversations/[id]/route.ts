import type { NextRequest } from 'next/server'
import { getStore } from '@/lib/conversations'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const conversation = await getStore().get(id)
  if (!conversation) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ conversation })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json()) as Partial<Record<string, unknown>>
  const existing = await getStore().get(id)
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })
  const conversation = await getStore().save({ ...existing, ...body, id })
  return Response.json({ conversation })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await getStore().remove(id)
  return Response.json({ ok: true })
}
