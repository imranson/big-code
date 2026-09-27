import { describe, expect, it, vi } from "vitest";
import { streamChat } from "@/lib/chat";

type StreamMessage = {
  content?: string;
  thinking?: string;
  tool_calls?: Array<{ function: { name: string; arguments?: unknown } }>;
};

type StreamEvent = { message: StreamMessage };

/** Build a fake Ollama `chat()` stream that yields the given message chunks. */
function chunks(...msgs: StreamMessage[]): AsyncIterable<StreamEvent> {
  return (async function* () {
    for (const m of msgs) yield { message: m };
  })();
}

async function collect(gen: AsyncIterable<unknown>): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for await (const e of gen) out.push(e as Record<string, unknown>);
  return out;
}

function makeClient(chat: (args: never) => AsyncIterable<StreamEvent>) {
  return { chat: vi.fn(chat), webSearch: vi.fn(), webFetch: vi.fn() };
}

describe("streamChat", () => {
  it("streams token deltas and yields done with messages (system excluded)", async () => {
    const client = makeClient(() => chunks({ content: "Hello" }, { content: " world" }));
    const events = await collect(
      streamChat({
        client: client as never,
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        system: "sys",
        tools: [],
      }),
    );

    expect(events.filter((e) => e.type === "token")).toEqual([
      { type: "token", delta: "Hello" },
      { type: "token", delta: " world" },
    ]);

    const done = events.find((e) => e.type === "done");
    expect(done?.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello world", thinking: "" },
    ]);
  });

  it("streams thinking deltas and attaches thinking to the assistant message", async () => {
    const client = makeClient(() =>
      chunks({ thinking: "hmm" }, { thinking: "..." }, { content: "answer" }),
    );
    const events = await collect(
      streamChat({
        client: client as never,
        model: "m",
        messages: [],
        system: "",
        tools: [],
      }),
    );

    expect(events.filter((e) => e.type === "thinking")).toEqual([
      { type: "thinking", delta: "hmm" },
      { type: "thinking", delta: "..." },
    ]);

    const done = events.find((e) => e.type === "done");
    expect(done?.messages).toEqual([
      { role: "assistant", content: "answer", thinking: "hmm..." },
    ]);
  });

  it("prepends the system message to the first chat request", async () => {
    const seen: unknown[][] = [];
    const client = makeClient((args) => {
      // snapshot: streamChat mutates the messages array in place afterwards
      seen.push([...(args as { messages: unknown[] }).messages]);
      return chunks({ content: "ok" });
    });
    await collect(
      streamChat({
        client: client as never,
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        system: "SYS",
        tools: [],
      }),
    );

    expect(seen[0][0]).toEqual({ role: "system", content: "SYS" });
    expect(seen[0]).toHaveLength(2);
  });

  it("does not prepend a system message when system is empty", async () => {
    const seen: unknown[][] = [];
    const client = makeClient((args) => {
      seen.push([...(args as { messages: unknown[] }).messages]);
      return chunks({ content: "ok" });
    });
    await collect(
      streamChat({
        client: client as never,
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        system: "",
        tools: [],
      }),
    );

    expect(seen[0]).toEqual([{ role: "user", content: "hi" }]);
  });

  it("forwards the think option (auto -> true, off/undefined -> undefined, levels pass through)", async () => {
    const client1 = makeClient(() => chunks({ content: "ok" }));
    await collect(
      streamChat({ client: client1 as never, model: "m", messages: [], system: "", tools: [], think: "auto" }),
    );
    expect(client1.chat.mock.calls[0][0].think).toBe(true);

    const client2 = makeClient(() => chunks({ content: "ok" }));
    await collect(
      streamChat({ client: client2 as never, model: "m", messages: [], system: "", tools: [], think: "off" }),
    );
    expect(client2.chat.mock.calls[0][0].think).toBeUndefined();

    const client3 = makeClient(() => chunks({ content: "ok" }));
    await collect(
      streamChat({ client: client3 as never, model: "m", messages: [], system: "", tools: [], think: "high" }),
    );
    expect(client3.chat.mock.calls[0][0].think).toBe("high");
  });

  it("executes tool calls and emits tool_call/tool_result before the final answer", async () => {
    const now = () => new Date("2026-01-01T00:00:00.000Z");
    let firstCall = true;
    const client = makeClient(() => {
      if (firstCall) {
        firstCall = false;
        return chunks({ tool_calls: [{ function: { name: "get_current_datetime", arguments: {} } }] });
      }
      return chunks({ content: "The time is known." });
    });

    const events = await collect(
      streamChat({
        client: client as never,
        model: "m",
        messages: [{ role: "user", content: "time?" }],
        system: "",
        tools: [],
        now,
      }),
    );

    expect(events.find((e) => e.type === "tool_call")).toMatchObject({
      type: "tool_call",
      name: "get_current_datetime",
      arguments: {},
    });
    expect(events.find((e) => e.type === "tool_result")).toEqual({
      type: "tool_result",
      name: "get_current_datetime",
      content: "2026-01-01T00:00:00.000Z",
    });

    const done = events.find((e) => e.type === "done");
    expect(done?.messages).toEqual([
      { role: "user", content: "time?" },
      {
        role: "assistant",
        content: "",
        thinking: "",
        tool_calls: [{ function: { name: "get_current_datetime", arguments: {} } }],
      },
      { role: "tool", content: "2026-01-01T00:00:00.000Z", tool_name: "get_current_datetime" },
      { role: "assistant", content: "The time is known.", thinking: "" },
    ]);
  });

  it("yields an error after exceeding maxIterations tool rounds", async () => {
    const client = makeClient(() =>
      chunks({ tool_calls: [{ function: { name: "get_current_datetime", arguments: {} } }] }),
    );
    const events = await collect(
      streamChat({
        client: client as never,
        model: "m",
        messages: [],
        system: "",
        tools: [],
        maxIterations: 2,
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      }),
    );

    expect(events.find((e) => e.type === "error")).toEqual({
      type: "error",
      error: "Exceeded maximum of 2 tool iterations",
    });
    expect(client.chat).toHaveBeenCalledTimes(2);
  });
});
