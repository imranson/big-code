import { NextRequest, NextResponse } from "next/server";
import { resolveConfig } from "@/lib/config";
import { getStore } from "@/lib/store";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { getTools } from "@/lib/tools";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const archived = new URL(request.url).searchParams.get("archived") === "true";
  const store = getStore();
  const conversations = archived ? await store.listArchived() : await store.list();
  return NextResponse.json({ conversations });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    model?: string;
    systemPrompt?: string;
  };

  const model = body.model || resolveConfig().model;
  const systemPrompt = body.systemPrompt ?? buildSystemPrompt({ model, tools: getTools() });

  const conversation = await getStore().create({
    title: body.title,
    model,
    systemPrompt,
  });

  return NextResponse.json({ conversation }, { status: 201 });
}
