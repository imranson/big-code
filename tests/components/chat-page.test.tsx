// @vitest-environment jsdom
//
// UI CONTRACT (encode these accessible names in the page/component markup, or
// adjust the queries below to match — the behaviour is what matters):
//   * a button with accessible name matching /new conversation/i
//   * a checkbox or switch with accessible name matching /thinking/i
//   * a textbox for the chat input
//   * a button with accessible name matching /send/i for submitting
//   * an "archive" control with accessible name matching /archive/i per conversation
//   * an indicator element containing a "%" (context window usage)
// The page default export (app/page.tsx) is a client component that fetches
// /api/config, /api/conversations and POSTs to /api/chat / /api/conversations.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";

const enc = new TextEncoder();

function ndjsonStream(lines: Array<Record<string, unknown>>): Response {
  return new Response(
    new ReadableStream({
      start(c) {
        for (const line of lines) c.enqueue(enc.encode(`${JSON.stringify(line)}\n`));
        c.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
  );
}

function setupFetch(chatLines: Array<Record<string, unknown>> = []) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.endsWith("/api/config")) {
      return Response.json({ model: "gpt-oss:120b", contextWindow: 128000, host: "https://ollama.com" });
    }
    if (url.endsWith("/api/conversations") && method === "GET") {
      return Response.json({ conversations: [] });
    }
    if (url.endsWith("/api/conversations") && method === "POST") {
      return Response.json(
        {
          conversation: {
            id: "c1",
            title: "New conversation",
            model: "gpt-oss:120b",
            system_prompt: "",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
            messages: [],
          },
        },
        { status: 201 },
      );
    }
    if (url.includes("/api/chat")) {
      return ndjsonStream(chatLines);
    }
    if (/\/api\/conversations\/[^/]+\/archive/.test(url)) {
      return Response.json({ conversation: { id: "c1" } });
    }
    throw new Error(`unmocked fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("Chat page", () => {
  it("renders the new-conversation button and the thinking toggle", async () => {
    setupFetch();
    render(<Home />);
    expect(await screen.findByRole("button", { name: /new conversation/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /thinking/i })).toBeInTheDocument();
  });

  it("shows a context-window usage indicator", async () => {
    setupFetch();
    render(<Home />);
    expect(await screen.findByText(/%/)).toBeInTheDocument();
  });

  it("creates a new conversation when the button is clicked", async () => {
    const fetchMock = setupFetch();
    const user = userEvent.setup();
    render(<Home />);

    await user.click(await screen.findByRole("button", { name: /new conversation/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([u, i]) => String(u).endsWith("/api/conversations") && (i?.method ?? "GET") === "POST",
      );
      expect(post).toBeTruthy();
    });
  });

  it("streams an assistant reply when a message is sent", async () => {
    setupFetch([
      { type: "token", delta: "Hello" },
      { type: "token", delta: " world" },
      { type: "done", messages: [] },
    ]);
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByRole("textbox"), "hi");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText(/Hello world/)).toBeInTheDocument();
  });

  it("includes the thinking option in the chat request when toggled", async () => {
    const fetchMock = setupFetch();
    const user = userEvent.setup();
    render(<Home />);

    await user.click(await screen.findByRole("checkbox", { name: /thinking/i }));
    await user.type(screen.getByRole("textbox"), "hi");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      const chat = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/chat"));
      expect(chat).toBeTruthy();
      const body = JSON.parse(String((chat![1] as RequestInit).body));
      expect(body.think).toBeTruthy();
    });
  });

  it("archives a conversation when its archive control is clicked", async () => {
    const fetchMock = setupFetch();
    const user = userEvent.setup();
    render(<Home />);

    await user.click(await screen.findByRole("button", { name: /archive/i }));

    await waitFor(() => {
      const archive = fetchMock.mock.calls.find(([u]) =>
        /\/api\/conversations\/[^/]+\/archive/.test(String(u)),
      );
      expect(archive).toBeTruthy();
    });
  });
});
