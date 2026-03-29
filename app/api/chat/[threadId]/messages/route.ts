import { NextResponse } from "next/server";
import { respondInThread } from "@/lib/chat";
import { buildThreadWorkspace } from "@/lib/threadWorkspace";

export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const workspace = await buildThreadWorkspace(threadId);
  return NextResponse.json(workspace);
}

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const body = (await req.json()) as { message: string };
  const message = body.message?.trim();

  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  await respondInThread(threadId, message);
  const workspace = await buildThreadWorkspace(threadId);
  return NextResponse.json(workspace);
}
