import { loadConfig } from '@/lib/config'
import { ConversationStore } from '@/lib/storage'
import { defaultSystemPrompt } from '@/lib/system-prompt'

/** GET /api/conversations — list active conversations. */
export async function GET() {
  const store = new ConversationStore(loadConfig().dataDir)
  const conversations = await store.list()
  return Response.json({ conversations })
}

/**
 * POST /api/conversations — create a conversation. Model and system prompt
 * fall back to server defaults so the client can POST an empty body.
 */
export async function POST(request: Request) {
  const config = loadConfig()
  const store = new ConversationStore(config.dataDir)
  const body = (await request.json().catch(() => ({}))) as {
    model?: string
    system_prompt?: string
    title?: string
  }
  const model = body.model ?? config.model
  const conversation = await store.create({
    model,
    systemPrompt: body.system_prompt ?? defaultSystemPrompt(model),
    title: body.title,
  })
  return Response.json(conversation, { status: 201 })
}