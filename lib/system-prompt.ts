import type { Tool } from "@/lib/tools";

const DEFAULT_TEMPLATE = [
  "You are Assistant, a helpful, accurate and concise assistant.",
  "",
  "You are powered by the model '{{model}}'.",
  "You have access to tools. Prefer them over guessing whenever timeliness or accuracy matters.",
  "",
  "Available tools:",
  "{{tools}}",
].join("\n");

/** Build the system prompt from the model name and tool list. */
export function buildSystemPrompt(input: {
  model: string;
  tools: Tool[];
  template?: string;
}): string {
  const { model, tools, template } = input;

  const toolsText =
    tools.length === 0
      ? "- (none)"
      : tools
          .map((tool) => {
            const name = tool.function.name;
            const description = tool.function.description || "(no description)";
            return `- ${name}: ${description}`;
          })
          .join("\n");

  const tpl = template ?? DEFAULT_TEMPLATE;
  return tpl.replaceAll("{{model}}", model).replaceAll("{{tools}}", toolsText);
}
