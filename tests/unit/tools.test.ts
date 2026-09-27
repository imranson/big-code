import { describe, expect, it, vi } from "vitest";
import { executeTool, getTools } from "@/lib/tools";

describe("getTools", () => {
  it("returns three function tools", () => {
    const tools = getTools();
    expect(tools).toHaveLength(3);
    for (const tool of tools) expect(tool.type).toBe("function");
    expect(tools.map((t) => t.function.name)).toEqual([
      "web_search",
      "web_fetch",
      "get_current_datetime",
    ]);
  });

  it("declares web_search parameters", () => {
    const tool = getTools().find((t) => t.function.name === "web_search")!;
    expect(tool.function.parameters.required).toEqual(["query"]);
    expect(tool.function.parameters.properties.query.type).toBe("string");
    expect(tool.function.parameters.properties.max_results.type).toBe("number");
  });

  it("declares web_fetch parameters", () => {
    const tool = getTools().find((t) => t.function.name === "web_fetch")!;
    expect(tool.function.parameters.required).toEqual(["url"]);
    expect(tool.function.parameters.properties.url.type).toBe("string");
  });

  it("declares get_current_datetime with no parameters", () => {
    const tool = getTools().find((t) => t.function.name === "get_current_datetime")!;
    expect(tool.function.parameters.properties).toEqual({});
  });
});

describe("executeTool", () => {
  const fixedNow = () => new Date("2026-01-01T00:00:00.000Z");

  it("returns the ISO datetime for get_current_datetime", async () => {
    const client = {};
    const out = await executeTool("get_current_datetime", {}, client as never, fixedNow);
    expect(out).toBe("2026-01-01T00:00:00.000Z");
  });

  it("calls webSearch and JSON-stringifies the result", async () => {
    const webSearch = vi.fn().mockResolvedValue({ results: [{ title: "Cats" }] });
    const client = { webSearch };
    const out = await executeTool(
      "web_search",
      { query: "cats", max_results: 3 },
      client as never,
    );
    expect(webSearch).toHaveBeenCalledWith({ query: "cats", maxResults: 3 });
    expect(out).toBe('{"results":[{"title":"Cats"}]}');
  });

  it("coerces max_results and falls back to undefined when absent or invalid", async () => {
    const webSearch = vi.fn().mockResolvedValue({ ok: true });
    const client = { webSearch };

    await executeTool("web_search", { query: "x", max_results: "7" }, client as never);
    expect(webSearch).toHaveBeenLastCalledWith({ query: "x", maxResults: 7 });

    await executeTool("web_search", { query: "x", max_results: "abc" }, client as never);
    expect(webSearch).toHaveBeenLastCalledWith({ query: "x", maxResults: undefined });

    await executeTool("web_search", { query: "x" }, client as never);
    expect(webSearch).toHaveBeenLastCalledWith({ query: "x", maxResults: undefined });

    // camelCase fallback when max_results is absent
    await executeTool("web_search", { query: "x", maxResults: 5 }, client as never);
    expect(webSearch).toHaveBeenLastCalledWith({ query: "x", maxResults: 5 });
  });

  it("calls webFetch with the url", async () => {
    const webFetch = vi.fn().mockResolvedValue({ title: "Page" });
    const client = { webFetch };
    const out = await executeTool("web_fetch", { url: "https://example.com" }, client as never);
    expect(webFetch).toHaveBeenCalledWith({ url: "https://example.com" });
    expect(out).toBe('{"title":"Page"}');
  });

  it("throws for an unknown tool", async () => {
    await expect(executeTool("unknown", {}, {} as never)).rejects.toThrow("Unknown tool: unknown");
  });
});
