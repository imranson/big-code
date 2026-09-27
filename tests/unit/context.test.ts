import { describe, expect, it } from "vitest";
import { estimateContext, estimateTokens } from "@/lib/context";

// The estimator uses the documented "roughly 4 characters per token" heuristic:
//   estimateTokens(text) = max(0, ceil(text.length / 4))
//   estimateContext  sums tokens over systemPrompt + each message content/thinking,
//                    clamps the ratio to [0, 1], and derives percent = round(ratio * 100).

describe("estimateTokens", () => {
  it("estimates roughly 4 characters per token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("12345678")).toBe(2);
  });
});

describe("estimateContext", () => {
  it("returns zero usage for empty input", () => {
    expect(estimateContext({ messages: [], contextWindow: 128000 })).toEqual({
      used: 0,
      total: 128000,
      ratio: 0,
      percent: 0,
    });
  });

  it("sums tokens across messages and system prompt", () => {
    const r = estimateContext({
      messages: [
        { content: "abcd" }, // 1
        { content: "abcdefgh" }, // 2
        { content: "xy", thinking: "abcd" }, // 1 + 1
      ],
      systemPrompt: "abcd", // 1
      contextWindow: 128000,
    });
    expect(r.used).toBe(6);
    expect(r.total).toBe(128000);
    expect(r.ratio).toBeCloseTo(6 / 128000, 12);
    expect(r.percent).toBe(0);
  });

  it("clamps ratio and percent at 100", () => {
    const r = estimateContext({
      messages: [{ content: "x".repeat(1_000_000) }],
      contextWindow: 1000,
    });
    expect(r.ratio).toBe(1);
    expect(r.percent).toBe(100);
  });

  it("handles a zero context window defensively", () => {
    const r = estimateContext({ messages: [{ content: "abcd" }], contextWindow: 0 });
    expect(r.ratio).toBe(0);
    expect(r.percent).toBe(0);
  });
});
