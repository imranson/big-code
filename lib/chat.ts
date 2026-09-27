import { executeTool } from "@/lib/tools";
import type { Message } from "@/lib/store";

export interface StreamChatOptions {
  // Loose on purpose: the Ollama SDK client (or a test double) is accepted here.
  client: {
    chat: (args: any) => Promise<AsyncIterable<{ message?: Message }>>;
    webSearch?: (args: { query: string; maxResults?: number }) => Promise<unknown>;
    webFetch?: (args: { url: string }) => Promise<unknown>;
  };
  model: string;
  messages: Message[];
  system: string;
  think?: string;
  tools?: unknown[];
  maxIterations?: number;
  now?: () => Date;
}

function mapThink(think?: string): boolean | "high" | "medium" | "low" | undefined {
  if (think === "auto") return true;
  if (!think || think === "off") return undefined;
  return think as "high" | "medium" | "low";
}

/**
 * Stream a chat completion, emitting token / thinking / tool_call / tool_result
 * events and finishing with a `done` event carrying the full transcript
 * (system message excluded).
 */
export async function* streamChat(options: StreamChatOptions) {
  const { client, model, system } = options;
  const tools = options.tools ?? [];
  const maxIterations = options.maxIterations ?? 10;
  const now = options.now ?? (() => new Date());
  const transcript: Message[] = [...options.messages];

  let iteration = 0;
  while (true) {
    iteration += 1;
    if (iteration > maxIterations) {
      yield { type: "error", error: `Exceeded maximum of ${maxIterations} tool iterations` };
      return;
    }

    const requestMessages = system
      ? [{ role: "system", content: system }, ...transcript]
      : [...transcript];

    const chatArgs: {
      model: string;
      messages: Message[];
      stream: boolean;
      tools: unknown[];
      think?: boolean | "high" | "medium" | "low";
    } = { model, messages: requestMessages, stream: true, tools };

    const mappedThink = mapThink(options.think);
    if (mappedThink !== undefined) chatArgs.think = mappedThink;

    const stream = await client.chat(chatArgs);

    let content = "";
    let thinking = "";
    const toolCalls: NonNullable<Message["tool_calls"]> = [];

    for await (const event of stream) {
      const message = event?.message;
      if (message?.content) {
        content += message.content;
        yield { type: "token", delta: message.content };
      }
      if (message?.thinking) {
        thinking += message.thinking;
        yield { type: "thinking", delta: message.thinking };
      }
      if (message?.tool_calls) {
        for (const call of message.tool_calls) toolCalls.push(call);
      }
    }

    if (toolCalls.length > 0) {
      transcript.push({ role: "assistant", content, thinking, tool_calls: toolCalls });

      for (const call of toolCalls) {
        const name = call.function.name;
        const args = (call.function.arguments ?? {}) as Record<string, unknown>;
        yield { type: "tool_call", name, arguments: args };

        const result = await executeTool(name, args, client, now);
        yield { type: "tool_result", name, content: result };

        transcript.push({ role: "tool", content: result, tool_name: name });
      }

      continue;
    }

    transcript.push({ role: "assistant", content, thinking });
    yield { type: "done", messages: transcript };
    return;
  }
}
