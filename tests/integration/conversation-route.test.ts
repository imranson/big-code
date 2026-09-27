import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

let tmp: string;
let convRoutes: typeof import("@/app/api/conversations/route");
let idRoutes: typeof import("@/app/api/conversations/[id]/route");

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "conv-"));
  process.env.DATA_DIR = tmp;
  delete process.env.OLLAMA_MODEL;
  vi.resetModules();
  convRoutes = await import("@/app/api/conversations/route");
  idRoutes = await import("@/app/api/conversations/[id]/route");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function createConversation(body: Record<string, unknown> = {}) {
  const res = await convRoutes.POST(
    new NextRequest("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
  return (await res.json()).conversation;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/conversations/[id]", () => {
  it("GET returns 404 for a missing conversation", async () => {
    const res = await idRoutes.GET(new NextRequest("http://localhost/x"), params("missing"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("GET returns the conversation", async () => {
    const c = await createConversation({ title: "Hi" });
    const res = await idRoutes.GET(new NextRequest("http://localhost/x"), params(c.id));
    expect(res.status).toBe(200);
    const { conversation } = await res.json();
    expect(conversation.id).toBe(c.id);
    expect(conversation.title).toBe("Hi");
  });

  it("PATCH updates a conversation while preserving its id", async () => {
    const c = await createConversation({});
    const res = await idRoutes.PATCH(
      new NextRequest("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      }),
      params(c.id),
    );
    expect(res.status).toBe(200);
    const { conversation } = await res.json();
    expect(conversation.title).toBe("Updated");
    expect(conversation.id).toBe(c.id);
  });

  it("PATCH returns 404 for a missing conversation", async () => {
    const res = await idRoutes.PATCH(
      new NextRequest("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ title: "x" }),
      }),
      params("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("DELETE removes a conversation", async () => {
    const c = await createConversation({});
    const res = await idRoutes.DELETE(new NextRequest("http://localhost/x"), params(c.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const after = await idRoutes.GET(new NextRequest("http://localhost/x"), params(c.id));
    expect(after.status).toBe(404);
  });
});
