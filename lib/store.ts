import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_MODEL } from "@/lib/config";

export interface Message {
  role: string;
  content?: string;
  thinking?: string;
  tool_calls?: Array<{ function: { name: string; arguments?: unknown } }>;
  tool_name?: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
  messages: Message[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface CreateInput {
  title?: string;
  model?: string;
  systemPrompt?: string;
}

/** Derive a human-friendly title from the first user message. */
export function deriveTitle(messages: Message[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser || typeof firstUser.content !== "string") return "New conversation";

  const collapsed = firstUser.content.trim().replace(/\s+/g, " ");
  if (collapsed === "") return "New conversation";
  if (collapsed.length > 60) return collapsed.slice(0, 57) + "…";
  return collapsed;
}

function toSummary(conversation: Conversation): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    model: conversation.model,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
  };
}

export class ConversationStore {
  private readonly conversationsDir: string;
  private readonly archiveDir: string;

  constructor(baseDir?: string) {
    const root = baseDir ?? process.env.DATA_DIR ?? join(process.cwd(), "data");
    this.conversationsDir = join(root, "conversations");
    this.archiveDir = join(root, "archive");
    mkdirSync(this.conversationsDir, { recursive: true });
    mkdirSync(this.archiveDir, { recursive: true });
  }

  private pathFor(id: string, archived: boolean): string {
    return join(archived ? this.archiveDir : this.conversationsDir, `${id}.json`);
  }

  private readAll(dir: string): Conversation[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(join(dir, file), "utf-8")) as Conversation)
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  }

  /** Create a new conversation with sensible defaults and persist it. */
  async create(input: CreateInput = {}): Promise<Conversation> {
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: randomUUID().replace(/-/g, ""),
      title: input.title ?? "New conversation",
      model: input.model ?? DEFAULT_MODEL,
      system_prompt: input.systemPrompt ?? "",
      created_at: now,
      updated_at: now,
      messages: [],
    };
    await this.write(conversation);
    return conversation;
  }

  /** Persist a full conversation object under its own id. */
  async write(conversation: Conversation): Promise<Conversation> {
    writeFileSync(this.pathFor(conversation.id, false), JSON.stringify(conversation, null, 2));
    return conversation;
  }

  /** List active conversations as summaries, newest first. */
  async list(): Promise<ConversationSummary[]> {
    return this.readAll(this.conversationsDir).map(toSummary);
  }

  /** List archived conversations as summaries, newest first. */
  async listArchived(): Promise<ConversationSummary[]> {
    return this.readAll(this.archiveDir).map(toSummary);
  }

  /** Find a conversation by id in the active or archived directory. */
  async get(id: string): Promise<Conversation | null> {
    for (const archived of [false, true]) {
      const path = this.pathFor(id, archived);
      if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as Conversation;
    }
    return null;
  }

  /** Save an existing conversation, bumping updated_at. */
  async save(conversation: Conversation): Promise<Conversation> {
    const updated: Conversation = { ...conversation, updated_at: new Date().toISOString() };
    await this.write(updated);
    return updated;
  }

  /** Move a conversation from the active directory to the archive. */
  async archive(id: string): Promise<void> {
    const src = this.pathFor(id, false);
    const dst = this.pathFor(id, true);
    if (existsSync(src)) renameSync(src, dst);
  }

  /** Move a conversation from the archive back to the active directory. */
  async unarchive(id: string): Promise<void> {
    const src = this.pathFor(id, true);
    const dst = this.pathFor(id, false);
    if (existsSync(src)) renameSync(src, dst);
  }

  /** Delete a conversation from either directory. */
  async remove(id: string): Promise<void> {
    for (const archived of [false, true]) {
      const path = this.pathFor(id, archived);
      if (existsSync(path)) unlinkSync(path);
    }
  }
}

let store: ConversationStore | null = null;

/** Lazily-created singleton store, seeded from DATA_DIR. */
export function getStore(): ConversationStore {
  if (!store) store = new ConversationStore();
  return store;
}
