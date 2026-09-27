import { NextRequest } from "next/server";
import { resolveConfig } from "@/lib/config";
import { streamChat } from "@/lib/chat";
import { getOllamaClient } from "@/lib/ollama";
import { deriveTitle, getStore, type Message } from "@/lib/store";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { getTools } from "@/lib/tools";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    conversationId?: string;
    model?: string;
    think?: string;
    messages?: Message[];
    systemPrompt?: string;
  };

  const model = body.model || resolveConfig().model;
  const messages = body.messages ?? [];
  const system = body.systemPrompt ?? buildSystemPrompt({ model, tools: getTools() });
  const conversationId = body.conversationId;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      let finalMessages: Message[] = messages;

      try {
        const client = getOllamaClient();
        for await (const event of streamChat({
          client,
          model,
          messages,
          system,
          think: body.think,
          tools: getTools(),
        })) {
          send(event);
          if ((event as { type?: string }).type === "done") {
            finalMessages = (event as { messages: Message[] }).messages;
          }
        }

        const store = getStore();
        const title = deriveTitle(finalMessages);

        if (conversationId) {
          const existing = await store.get(conversationId);
          if (existing) {
            await store.save({
              ...existing,
              model,
              system_prompt: system,
              messages: finalMessages,
              title,
            });
          } else {
            const now = new Date().toISOString();
            await store.write({
              id: conversationId,
              title,
              model,
              system_prompt: system,
              created_at: now,
              updated_at: now,
              messages: finalMessages,
            });
          }
        } else {
          const created = await store.create({ title, model, systemPrompt: system });
          await store.save({ ...created, messages: finalMessages });
        }
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : String(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}
