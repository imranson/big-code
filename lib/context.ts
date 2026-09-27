export interface ContextMessage {
  content?: string;
  thinking?: string;
}

export interface ContextEstimate {
  used: number;
  total: number;
  ratio: number;
  percent: number;
}

/** Rough token estimate: ~4 characters per token. */
export function estimateTokens(text?: string): number {
  if (!text) return 0;
  return Math.max(0, Math.ceil(text.length / 4));
}

/** Estimate context usage across the system prompt and every message. */
export function estimateContext(input: {
  messages: ContextMessage[];
  systemPrompt?: string;
  contextWindow: number;
}): ContextEstimate {
  const { messages, systemPrompt, contextWindow } = input;
  const total = contextWindow ?? 0;

  let used = 0;
  if (systemPrompt) used += estimateTokens(systemPrompt);
  for (const message of messages) {
    if (message.content) used += estimateTokens(message.content);
    if (message.thinking) used += estimateTokens(message.thinking);
  }

  const ratio = total > 0 ? Math.min(1, Math.max(0, used / total)) : 0;
  const percent = Math.round(ratio * 100);

  return { used, total, ratio, percent };
}
