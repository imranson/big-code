import { loadConfig } from '@/lib/config'
import { ConversationStore } from '@/lib/storage'

type RouteContext = { params: Promise<{ id: string }> }

/** GET /api/conversations/[id] — full conversation with messages. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const store = new ConversationStore(loadConfig().dataDir)
  const conversation = await store.get(id)
  if (!conversation) {
    return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  }
  return Response.json(conversation)
}

/** PATCH /api/conversations/[id] — update title / system prompt / model. */
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as {
    title?: unknown
    system_prompt?: unknown
    model?: unknown
  } | null
  if (!body) {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const patch: { title?: string; system_prompt?: string; model?: string } = {}
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title
  if (typeof body.system_prompt === 'string') patch.system_prompt = body.system_prompt
  if (typeof body.model === 'string' && body.model.trim()) patch.model = body.model
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'Nothing to update.' }, { status: 400 })
  }
  const store = new ConversationStore(loadConfig().dataDir)
  const conversation = await store.update(id, patch)
  if (!conversation) {
    return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  }
  return Response.json(conversation)
}