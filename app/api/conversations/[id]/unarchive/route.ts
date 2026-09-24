import type { NextRequest } from 'next/server'
import { getStore } from '@/lib/conversations'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const conversation = await getStore().unarchive(id)
  return Response.json({ conversation })
}
