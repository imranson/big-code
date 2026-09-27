import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/config/route";

const ENV_KEYS = ["OLLAMA_MODEL", "OLLAMA_CONTEXT_WINDOW", "OLLAMA_HOST"] as const;

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("GET /api/config", () => {
  afterEach(clearEnv);

  it("returns the resolved config with defaults", async () => {
    clearEnv();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      model: "gpt-oss:120b",
      contextWindow: 128000,
      host: "https://ollama.com",
    });
  });

  it("reflects environment overrides", async () => {
    process.env.OLLAMA_MODEL = "kimi-k2.6:cloud";
    process.env.OLLAMA_CONTEXT_WINDOW = "200000";
    const res = await GET();
    const body = await res.json();
    expect(body.model).toBe("kimi-k2.6:cloud");
    expect(body.contextWindow).toBe(200000);
  });
});
