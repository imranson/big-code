import type { NextRequest } from 'next/server'
import { getOllamaClient } from '@/lib/ollama'
import { runAgent } from '@/lib/agent'
import { getTools } from '@/lib/tools'
import { buildSystemPrompt } from '@/lib/systemPrompt'
import { getStore, deriveTitle } from '@/lib/conversations'
import type { ChatRequestBody } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatRequestBody
  const { conversationId, model, systemPrompt, think, messages } = body

  const tools = getTools()
  const system = systemPrompt?.trim() ? systemPrompt : buildSystemPrompt({ model, tools })
  const client = getOllamaClient()

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (event: object) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))

      let finalMessages = messages
      try {
        for await (const event of runAgent({ client, model, messages, system, think, tools })) {
          if (event.type === 'done') finalMessages = event.messages
          enqueue(event)
        }
      } catch (error) {
        enqueue({ type: 'error', error: error instanceof Error ? error.message : String(error) })
      }

      if (conversationId) {
        try {
          const store = getStore()
          const existing = await store.get(conversationId)
          const keepTitle = existing && existing.title !== 'New conversation' && existing.title !== ''
          const title = keepTitle ? existing!.title : deriveTitle(finalMessages)
          const base = existing ?? {
            id: conversationId,
            created_at: new Date().toISOString(),
            title: 'New conversation',
            model,
            system_prompt: '',
            updated_at: new Date().toISOString(),
            messages: [],
          }
          await store.save({ ...base, title, model, system_prompt: system, messages: finalMessages })
        } catch (error) {
          enqueue({
            type: 'error',
            error: `Failed to save conversation: ${error instanceof Error ? error.message : String(error)}`,
          })
        }
      }

      controller.close()
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
