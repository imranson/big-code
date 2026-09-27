import { Ollama } from "ollama";
import { resolveConfig } from "@/lib/config";

/** Construct an SDK client from OLLAMA_HOST / OLLAMA_API_KEY. */
export function getOllamaClient(): Ollama {
  const { host } = resolveConfig();
  const apiKey = process.env.OLLAMA_API_KEY;
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
  return new Ollama({ host, headers });
}
