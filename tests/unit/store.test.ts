import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "@/lib/store";

let tmp: string;
let store: ConversationStore;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "store-"));
  store = new ConversationStore(tmp);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("ConversationStore", () => {
  it("creates a conversation with defaults and persists it", async () => {
    const c = await store.create({});
    expect(c.id).toMatch(/^[0-9a-f]{32}$/); // uuid with dashes stripped
    expect(c.title).toBe("New conversation");
    expect(c.model).toBe("gpt-oss:120b");
    expect(c.system_prompt).toBe("");
    expect(c.messages).toEqual([]);
    expect(c.created_at).toBe(c.updated_at);
    expect(existsSync(join(tmp, "conversations", `${c.id}.json`))).toBe(true);
  });

  it("creates a conversation with provided fields", async () => {
    const c = await store.create({ title: "My convo", model: "m", systemPrompt: "sys" });
    expect(c.title).toBe("My convo");
    expect(c.model).toBe("m");
    expect(c.system_prompt).toBe("sys");
  });

  it("lists summaries sorted by updated_at desc, omitting messages", async () => {
    const base = { model: "m", system_prompt: "", created_at: "2024-01-01T00:00:00.000Z", messages: [] };
    await store.write({ ...base, id: "a", title: "A", updated_at: "2024-01-01T00:00:00.000Z" });
    await store.write({ ...base, id: "b", title: "B", updated_at: "2025-01-01T00:00:00.000Z" });
    const list = await store.list();
    expect(list.map((c) => c.id)).toEqual(["b", "a"]);
    for (const summary of list) {
      expect(Object.keys(summary).sort()).toEqual([
        "created_at",
        "id",
        "model",
        "title",
        "updated_at",
      ]);
    }
  });

  it("get finds a conversation in conversations or archive", async () => {
    const c = await store.create({});
    expect(await store.get(c.id)).toEqual(c);
    await store.archive(c.id);
    expect(await store.get(c.id)).toMatchObject({ id: c.id });
    expect(await store.get("missing")).toBeNull();
  });

  it("save updates updated_at and persists", async () => {
    const c = await store.create({});
    const before = c.updated_at;
    const saved = await store.save({ ...c, title: "Changed" });
    expect(saved.title).toBe("Changed");
    expect(saved.updated_at >= before).toBe(true);
    expect(readFileSync(join(tmp, "conversations", `${c.id}.json`), "utf-8")).toContain("Changed");
  });

  it("archive moves a conversation from conversations to archive", async () => {
    const c = await store.create({});
    await store.archive(c.id);
    expect(existsSync(join(tmp, "conversations", `${c.id}.json`))).toBe(false);
    expect(existsSync(join(tmp, "archive", `${c.id}.json`))).toBe(true);
    expect(await store.list()).toHaveLength(0);
    expect(await store.listArchived()).toHaveLength(1);
  });

  it("unarchive moves a conversation back", async () => {
    const c = await store.create({});
    await store.archive(c.id);
    await store.unarchive(c.id);
    expect(existsSync(join(tmp, "conversations", `${c.id}.json`))).toBe(true);
    expect(existsSync(join(tmp, "archive", `${c.id}.json`))).toBe(false);
  });

  it("remove deletes from either directory", async () => {
    const c = await store.create({});
    await store.remove(c.id);
    expect(await store.get(c.id)).toBeNull();

    const d = await store.create({});
    await store.archive(d.id);
    await store.remove(d.id);
    expect(await store.get(d.id)).toBeNull();
  });

  it("listArchived returns only archived summaries", async () => {
    const c = await store.create({});
    await store.archive(c.id);
    const archived = await store.listArchived();
    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe(c.id);
  });
});
