import { NextResponse } from "next/server";
import { resolveConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(resolveConfig());
}
