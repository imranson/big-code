import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_MODEL, resolveConfig } from "@/lib/config";

const ENV_KEYS = ["OLLAMA_MODEL", "OLLAMA_CONTEXT_WINDOW", "OLLAMA_HOST"] as const;

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("DEFAULT_MODEL", () => {
  it("is gpt-oss:120b", () => {
    expect(DEFAULT_MODEL).toBe("gpt-oss:120b");
  });
});

describe("resolveConfig", () => {
  afterEach(clearEnv);

  it("falls back to defaults when the environment is unset", () => {
    clearEnv();
    expect(resolveConfig()).toEqual({
      model: "gpt-oss:120b",
      contextWindow: 128000,
      host: "https://ollama.com",
    });
  });

  it("reads environment overrides", () => {
    process.env.OLLAMA_MODEL = "kimi-k2.6:cloud";
    process.env.OLLAMA_CONTEXT_WINDOW = "256000";
    process.env.OLLAMA_HOST = "https://example.com";
    expect(resolveConfig()).toEqual({
      model: "kimi-k2.6:cloud",
      contextWindow: 256000,
      host: "https://example.com",
    });
  });

  it("falls back to the default context window on a non-numeric value", () => {
    process.env.OLLAMA_CONTEXT_WINDOW = "not-a-number";
    expect(resolveConfig().contextWindow).toBe(128000);
  });

  it("falls back to the default context window on zero", () => {
    process.env.OLLAMA_CONTEXT_WINDOW = "0";
    expect(resolveConfig().contextWindow).toBe(128000);
  });
});
