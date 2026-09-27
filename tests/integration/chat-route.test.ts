import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

let tmp: string;
let chatRoute: typeof import("@/app/api/chat/route");
let store: typeof import("@/lib/store");

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "chat-"));
  process.env.DATA_DIR = tmp;
  delete process.env.OLLAMA_HOST;
  delete process.env.OLLAMA_API_KEY;
  delete process.env.OLLAMA_MODEL;
  vi.resetModules();
  chatRoute = await import("@/app/api/chat/route");
  store = await import("@/lib/store");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

/** A Response that streams newline-delimited JSON, as the Ollama SDK emits.
 *  A trailing `{ done: true }` marks the end of stream, which the SDK requires. */
function ollamaChatStream(chunks: Array<Record<string, unknown>>): Response {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const chunk of [...chunks, { done: true }]) {
          c.enqueue(enc.encode(`${JSON.stringify(chunk)}\n`));
        }
        c.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
  );
}

async function ndjsonLines(res: Response): Promise<Array<Record<string, unknown>>> {
  return (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function post(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  it("streams tokens and persists the conversation with a derived title", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ollamaChatStream([{ message: { content: "Hello" } }, { message: { content: " there" } }]),
      ),
    );

    const res = await chatRoute.POST(
      post({
        conversationId: "c1",
        model: "m",
        think: "off",
        messages: [{ role: "user", content: "Say hi" }],
      }),
    );

    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const events = await ndjsonLines(res);
    expect(events.filter((e) => e.type === "token").map((e) => e.delta)).toEqual([
      "Hello",
      " there",
    ]);
    expect(events.some((e) => e.type === "done")).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(false);

    const saved = await store.getStore().get("c1");
    expect(saved).not.toBeNull();
    expect(saved!.title).toBe("Say hi");
    expect(saved!.model).toBe("m");
    expect(saved!.system_prompt).toContain("Available tools");
    expect(saved!.messages).toEqual([
      { role: "user", content: "Say hi" },
      { role: "assistant", content: "Hello there", thinking: "" },
    ]);
  });

  it("streams thinking deltas and forwards the think option to the client", async () => {
    const fetchMock = vi.fn(async () =>
      ollamaChatStream([{ message: { thinking: "Let me think" } }, { message: { content: "Answer" } }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await chatRoute.POST(
      post({ think: "auto", model: "m", messages: [{ role: "user", content: "q" }] }),
    );

    const events = await ndjsonLines(res);
    expect(events.filter((e) => e.type === "thinking").map((e) => e.delta)).toEqual([
      "Let me think",
    ]);

    // "auto" must be mapped to `think: true` on the outgoing Ollama request.
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body)).think).toBe(true);
  });

  it("streams tool_call/tool_result events and persists the tool exchange", async () => {
    let chatCalls = 0;
    const fetchMock = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes("/api/web_search")) {
        return Response.json({ results: [{ title: "Cats" }] });
      }
      if (u.includes("/api/chat")) {
        chatCalls += 1;
        if (chatCalls === 1) {
          return ollamaChatStream([
            {
              message: {
                tool_calls: [
                  { function: { name: "web_search", arguments: { query: "cats", max_results: 3 } } },
                ],
              },
            },
          ]);
        }
        return ollamaChatStream([{ message: { content: "Found cats." } }]);
      }
      throw new Error(`unexpected fetch: ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await chatRoute.POST(
      post({
        conversationId: "c2",
        model: "m",
        think: "off",
        messages: [{ role: "user", content: "search cats" }],
      }),
    );

    const events = await ndjsonLines(res);
    expect(events.find((e) => e.type === "tool_call")).toMatchObject({
      type: "tool_call",
      name: "web_search",
      arguments: { query: "cats", max_results: 3 },
    });
    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolResult).toMatchObject({ type: "tool_result", name: "web_search" });
    expect(toolResult?.content).toBe(JSON.stringify({ results: [{ title: "Cats" }] }));
    expect(events.some((e) => e.type === "done")).toBe(true);

    const saved = await store.getStore().get("c2");
    expect(saved!.messages).toEqual([
      { role: "user", content: "search cats" },
      {
        role: "assistant",
        content: "",
        thinking: "",
        tool_calls: [
          { function: { name: "web_search", arguments: { query: "cats", max_results: 3 } } },
        ],
      },
      {
        role: "tool",
        content: JSON.stringify({ results: [{ title: "Cats" }] }),
        tool_name: "web_search",
      },
      { role: "assistant", content: "Found cats.", thinking: "" },
    ]);
  });
});
