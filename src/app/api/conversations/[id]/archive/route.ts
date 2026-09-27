import { loadConfig } from '@/lib/config'
import { ConversationStore } from '@/lib/storage'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/conversations/[id]/archive — move a conversation between the
 * active conversations folder and the archive folder.
 * Body: { action: 'archive' | 'unarchive' } (defaults to 'archive').
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as { action?: string }
  const store = new ConversationStore(loadConfig().dataDir)
  const conversation =
    body.action === 'unarchive' ? await store.unarchive(id) : await store.archive(id)
  if (!conversation) {
    return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  }
  return Response.json(conversation)
}