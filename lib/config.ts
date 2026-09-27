export const DEFAULT_MODEL = "gpt-oss:120b";
export const DEFAULT_CONTEXT_WINDOW = 128000;
export const DEFAULT_HOST = "https://ollama.com";

export interface ResolvedConfig {
  model: string;
  contextWindow: number;
  host: string;
}

/** Resolve runtime config from environment variables, falling back to defaults. */
export function resolveConfig(): ResolvedConfig {
  const model = process.env.OLLAMA_MODEL || DEFAULT_MODEL;

  const rawWindow = Number.parseInt(process.env.OLLAMA_CONTEXT_WINDOW ?? "", 10);
  const contextWindow =
    Number.isFinite(rawWindow) && rawWindow > 0 ? rawWindow : DEFAULT_CONTEXT_WINDOW;

  const host = process.env.OLLAMA_HOST || DEFAULT_HOST;

  return { model, contextWindow, host };
}
