import { streamChat } from '@/lib/chat-service'
import { loadConfig } from '@/lib/config'
import { getOllamaClient } from '@/lib/ollama'
import { ConversationStore, titleFromContent } from '@/lib/storage'
import type { ChatMessage, ChatRequestBody, StreamEvent } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * POST /api/chat — run one chat turn for a stored conversation and stream
 * NDJSON events (thinking/content deltas, tool calls and results, usage) to
 * the client. The turn's messages are persisted to the conversation file,
 * including partials when the client aborts mid-stream.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ChatRequestBody | null
  if (!body || typeof body.conversationId !== 'string' || typeof body.content !== 'string' || !body.content.trim()) {
    return Response.json(
      { error: 'conversationId and a non-empty content are required.' },
      { status: 400 },
    )
  }

  const config = loadConfig()
  const store = new ConversationStore(config.dataDir)
  const conversation = await store.get(body.conversationId)
  if (!conversation) {
    return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  }

  const userMessage: ChatMessage = { role: 'user', content: body.content }
  const appended: ChatMessage[] = [userMessage]
  const client = getOllamaClient()
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      }
      let errored = false
      try {
        for await (const event of streamChat(
          { client, signal: request.signal },
          {
            model: conversation.model,
            systemPrompt: conversation.system_prompt,
            messages: [...conversation.messages, userMessage],
            think: Boolean(body.think),
            tools: body.tools !== false,
          },
        )) {
          if (event.type === 'assistant') {
            appended.push(event.message)
          } else if (event.type === 'tool_result') {
            appended.push({ role: 'tool', content: event.content, tool_name: event.tool_name })
          } else if (event.type === 'error') {
            errored = true
          }
          send(event)
        }
        // Persist the turn (including any partials streamed before a failure).
        const updated = await store.appendMessages(conversation.id, appended, {
          title: titleFromContent(body.content),
        })
        if (updated && !errored) {
          send({ type: 'done', conversation: updated })
        }
      } catch (error) {
        // Best effort: keep whatever streamed before the failure.
        try {
          await store.appendMessages(conversation.id, appended)
        } catch {
          // Ignore secondary persistence failures.
        }
        send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}