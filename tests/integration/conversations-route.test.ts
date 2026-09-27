import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

let tmp: string;
let routes: typeof import("@/app/api/conversations/route");

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "conv-"));
  process.env.DATA_DIR = tmp;
  delete process.env.OLLAMA_MODEL;
  vi.resetModules();
  routes = await import("@/app/api/conversations/route");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function post(body: unknown) {
  return new NextRequest("http://localhost/api/conversations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/conversations", () => {
  it("GET returns an empty list initially", async () => {
    const res = await routes.GET(new NextRequest("http://localhost/api/conversations"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversations: [] });
  });

  it("POST creates a conversation with defaults and returns 201", async () => {
    const res = await routes.POST(post({}));
    expect(res.status).toBe(201);
    const { conversation } = await res.json();
    expect(conversation.title).toBe("New conversation");
    expect(conversation.model).toBe("gpt-oss:120b");
    expect(conversation.messages).toEqual([]);
    expect(conversation.system_prompt).toContain("Available tools");
    expect(conversation.system_prompt).toContain("gpt-oss:120b");
  });

  it("POST honors title, model, and systemPrompt", async () => {
    const res = await routes.POST(post({ title: "T", model: "m", systemPrompt: "custom" }));
    const { conversation } = await res.json();
    expect(conversation.title).toBe("T");
    expect(conversation.model).toBe("m");
    expect(conversation.system_prompt).toBe("custom");
  });

  it("POST defaults the model to OLLAMA_MODEL when set", async () => {
    process.env.OLLAMA_MODEL = "env-model";
    const res = await routes.POST(post({}));
    const { conversation } = await res.json();
    expect(conversation.model).toBe("env-model");
  });

  it("GET lists created conversations as summaries", async () => {
    await routes.POST(post({ title: "A" }));
    const res = await routes.GET(new NextRequest("http://localhost/api/conversations"));
    const { conversations } = await res.json();
    expect(conversations).toHaveLength(1);
    expect(conversations[0].title).toBe("A");
    expect(conversations[0].messages).toBeUndefined();
  });

  it("GET with archived=true returns the archived list (empty when none archived)", async () => {
    await routes.POST(post({}));
    const res = await routes.GET(
      new NextRequest("http://localhost/api/conversations?archived=true"),
    );
    expect(await res.json()).toEqual({ conversations: [] });
  });
});
