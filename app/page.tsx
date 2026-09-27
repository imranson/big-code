"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { estimateContext } from "@/lib/context";
import type { Conversation, ConversationSummary, Message } from "@/lib/store";

type ChatEvent =
  | { type: "token"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_call"; name: string; arguments: unknown }
  | { type: "tool_result"; name: string; content: string }
  | { type: "done"; messages: Message[] }
  | { type: "error"; error: string };

export default function Home() {
  const [model, setModel] = useState("gpt-oss:120b");
  const [contextWindow, setContextWindow] = useState(128000);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamingRef = useRef<Message | null>(null);

  const refreshList = useCallback(async () => {
    const res = await fetch("/api/conversations");
    const data = await res.json();
    setConversations(data.conversations ?? []);
  }, []);

  const newConversation = useCallback(async () => {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setCurrent(data.conversation);
    await refreshList();
  }, [refreshList]);

  useEffect(() => {
    (async () => {
      const configRes = await fetch("/api/config");
      const config = await configRes.json();
      setModel(config.model);
      setContextWindow(config.contextWindow);

      const listRes = await fetch("/api/conversations");
      const list = await listRes.json();
      const convs: ConversationSummary[] = list.conversations ?? [];
      setConversations(convs);

      if (convs.length === 0) {
        await newConversation();
      }
    })();
  }, [newConversation]);

  const selectConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setCurrent(data.conversation);
  }, []);

  const archiveConversation = useCallback(
    async (id: string) => {
      await fetch(`/api/conversations/${id}/archive`, { method: "POST" });
      if (current?.id === id) setCurrent(null);
      await refreshList();
    },
    [current, refreshList],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !current || busy) return;

    setInput("");
    setError(null);
    setBusy(true);

    const userMessage: Message = { role: "user", content: text };
    const messages = [...current.messages, userMessage];
    setCurrent({ ...current, messages });

    const draft: Message = { role: "assistant", content: "", thinking: "" };
    streamingRef.current = draft;
    setStreaming(draft);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: current.id,
          model: current.model,
          think: thinking ? "auto" : "off",
          messages,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Chat request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const event = JSON.parse(trimmed) as ChatEvent;

          if (event.type === "token") {
            const next: Message = {
              ...streamingRef.current!,
              content: (streamingRef.current!.content ?? "") + event.delta,
            };
            streamingRef.current = next;
            setStreaming(next);
          } else if (event.type === "thinking") {
            const next: Message = {
              ...streamingRef.current!,
              thinking: (streamingRef.current!.thinking ?? "") + event.delta,
            };
            streamingRef.current = next;
            setStreaming(next);
          } else if (event.type === "done") {
            const accumulated = streamingRef.current;
            streamingRef.current = null;
            setStreaming(null);
            if (Array.isArray(event.messages) && event.messages.length > 0) {
              setCurrent((prev) => (prev ? { ...prev, messages: event.messages } : prev));
            } else if (accumulated) {
              setCurrent((prev) =>
                prev ? { ...prev, messages: [...prev.messages, accumulated] } : prev,
              );
            }
          } else if (event.type === "error") {
            setError(event.error);
            streamingRef.current = null;
            setStreaming(null);
          }
        }
      }

      if (streamingRef.current) {
        const accumulated = streamingRef.current;
        streamingRef.current = null;
        setStreaming(null);
        setCurrent((prev) =>
          prev ? { ...prev, messages: [...prev.messages, accumulated] } : prev,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      streamingRef.current = null;
      setStreaming(null);
    } finally {
      setBusy(false);
    }
  }, [input, current, busy, thinking]);

  const context = estimateContext({
    messages: current?.messages ?? [],
    systemPrompt: current?.system_prompt ?? "",
    contextWindow,
  });

  const messages = current?.messages ?? [];
  const displayMessages = streaming ? [...messages, streaming] : messages;

  return (
    <div className="app">
      <header className="header">
        <h1>Chat</h1>
        <button type="button" className="btn" onClick={newConversation}>
          New conversation
        </button>
        <div className="context-indicator" title="Approximate context window usage">
          {context.percent}% used
        </div>
        <div className="model">{model}</div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <h2>Conversations</h2>
          {conversations.length === 0 && <p className="muted">No conversations yet</p>}
          {conversations.map((convo) => (
            <div key={convo.id} className="sidebar-item">
              <button
                type="button"
                className="sidebar-title"
                onClick={() => selectConversation(convo.id)}
              >
                {convo.title}
              </button>
            </div>
          ))}
        </aside>

        <main className="chat">
          {current && (
            <div className="conversation-toolbar">
              <span className="conversation-title">{current.title}</span>
              <button
                type="button"
                className="archive-btn"
                aria-label={`Archive ${current.title}`}
                onClick={() => archiveConversation(current.id)}
              >
                Archive
              </button>
            </div>
          )}

          {error && <div className="error">{error}</div>}

          <div className="messages">
            {displayMessages.map((message, index) => (
              <div key={index} className={`message ${message.role}`}>
                <div className="role">{message.role}</div>
                {message.thinking ? (
                  <details className="thinking">
                    <summary>Thinking</summary>
                    <div>{message.thinking}</div>
                  </details>
                ) : null}
                {message.content ? <div className="content">{message.content}</div> : null}
                {message.tool_calls?.length ? (
                  <div className="tool-calls">
                    {message.tool_calls.map((call, i) => (
                      <code key={i}>{call.function.name}</code>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {displayMessages.length === 0 && (
              <p className="muted">Start a conversation by typing below.</p>
            )}
          </div>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <label className="thinking-toggle">
              <input
                type="checkbox"
                checked={thinking}
                onChange={(event) => setThinking(event.target.checked)}
              />
              <span>Thinking</span>
            </label>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type a message…"
              rows={2}
            />
            <button type="submit" className="btn" disabled={busy || !current}>
              Send
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}
