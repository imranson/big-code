import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

let tmp: string;
let convRoutes: typeof import("@/app/api/conversations/route");
let archiveRoute: typeof import("@/app/api/conversations/[id]/archive/route");
let unarchiveRoute: typeof import("@/app/api/conversations/[id]/unarchive/route");

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "conv-"));
  process.env.DATA_DIR = tmp;
  delete process.env.OLLAMA_MODEL;
  vi.resetModules();
  convRoutes = await import("@/app/api/conversations/route");
  archiveRoute = await import("@/app/api/conversations/[id]/archive/route");
  unarchiveRoute = await import("@/app/api/conversations/[id]/unarchive/route");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function createConversation() {
  const res = await convRoutes.POST(
    new NextRequest("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  );
  return (await res.json()).conversation;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const list = async (qs = "") => {
  const res = await convRoutes.GET(new NextRequest(`http://localhost/api/conversations${qs}`));
  return (await res.json()).conversations;
};

describe("archive / unarchive", () => {
  it("POST archive moves a conversation to the archive", async () => {
    const c = await createConversation();
    const res = await archiveRoute.POST(new NextRequest("http://localhost/x"), params(c.id));
    expect(res.status).toBe(200);
    expect((await res.json()).conversation.id).toBe(c.id);

    expect(await list()).toHaveLength(0);
    expect(await list("?archived=true")).toHaveLength(1);
  });

  it("POST unarchive moves a conversation back to the active list", async () => {
    const c = await createConversation();
    await archiveRoute.POST(new NextRequest("http://localhost/x"), params(c.id));

    const res = await unarchiveRoute.POST(new NextRequest("http://localhost/x"), params(c.id));
    expect(res.status).toBe(200);

    expect(await list()).toHaveLength(1);
    expect(await list("?archived=true")).toHaveLength(0);
  });
});
