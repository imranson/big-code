import { describe, expect, it } from "vitest";
import { deriveTitle } from "@/lib/store";

describe("deriveTitle", () => {
  it("defaults to 'New conversation' for empty messages", () => {
    expect(deriveTitle([])).toBe("New conversation");
  });

  it("defaults when there is no user message", () => {
    expect(deriveTitle([{ role: "assistant", content: "hi" }])).toBe("New conversation");
  });

  it("returns the first user message content", () => {
    expect(deriveTitle([{ role: "user", content: "Hello" }])).toBe("Hello");
  });

  it("finds the first user message even after assistant messages", () => {
    expect(
      deriveTitle([
        { role: "assistant", content: "How can I help?" },
        { role: "user", content: "What is 2+2?" },
        { role: "user", content: "ignore me" },
      ]),
    ).toBe("What is 2+2?");
  });

  it("collapses whitespace", () => {
    expect(deriveTitle([{ role: "user", content: "  Hello\t\tworld  \n" }])).toBe("Hello world");
  });

  it("does not truncate content of exactly 60 characters", () => {
    const s = "a".repeat(60);
    expect(deriveTitle([{ role: "user", content: s }])).toBe(s);
  });

  it("truncates content longer than 60 characters to 57 characters plus an ellipsis", () => {
    const out = deriveTitle([{ role: "user", content: "a".repeat(61) }]);
    expect(out).toHaveLength(58);
    expect(out.startsWith("a".repeat(57))).toBe(true);
    expect(out.endsWith("…")).toBe(true);
  });
});
