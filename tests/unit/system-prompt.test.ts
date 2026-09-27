import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/system-prompt";

// The default template locked in by this suite. The implementation must use
// exactly this text (with {{model}} and {{tools}} placeholders).
const DEFAULT_TEMPLATE = [
  "You are Assistant, a helpful, accurate and concise assistant.",
  "",
  "You are powered by the model '{{model}}'.",
  "You have access to tools. Prefer them over guessing whenever timeliness or accuracy matters.",
  "",
  "Available tools:",
  "{{tools}}",
].join("\n");

describe("buildSystemPrompt", () => {
  it("substitutes the model and renders an empty tool list", () => {
    const out = buildSystemPrompt({ model: "gpt-oss:120b", tools: [] });
    expect(out).toBe(
      DEFAULT_TEMPLATE.replace("{{model}}", "gpt-oss:120b").replace("{{tools}}", "- (none)"),
    );
    expect(out).toContain("powered by the model 'gpt-oss:120b'");
    expect(out).toContain("Available tools:\n- (none)");
  });

  it("lists each tool with its description", () => {
    const tools = [
      { type: "function", function: { name: "web_search", description: "Search the web." } },
      { type: "function", function: { name: "get_current_datetime", description: "Now." } },
    ];
    const out = buildSystemPrompt({ model: "m", tools });
    expect(out).toContain("- web_search: Search the web.");
    expect(out).toContain("- get_current_datetime: Now.");
  });

  it("uses '(no description)' for a tool that lacks one", () => {
    const tools = [{ type: "function", function: { name: "web_fetch" } }];
    const out = buildSystemPrompt({ model: "m", tools });
    expect(out).toContain("- web_fetch: (no description)");
  });

  it("replaces placeholders in a custom template", () => {
    const out = buildSystemPrompt({
      model: "x",
      tools: [],
      template: "model={{model}} tools={{tools}}",
    });
    expect(out).toBe("model=x tools=- (none)");
  });
});
