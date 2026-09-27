import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const conversation = await getStore().get(id);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ conversation });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const conversation = await getStore().get(id);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const updated = await getStore().save({ ...conversation, ...body, id: conversation.id });

  return NextResponse.json({ conversation: updated });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  await getStore().remove(id);
  return NextResponse.json({ ok: true });
}
