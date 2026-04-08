import { NextResponse } from "next/server";
import { getOrCreateDemoUser } from "@/lib/auth";
import { AgentError } from "@/lib/errors";
import { startThreadFromUpload } from "@/lib/threadFlow";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { imageUrl: string; note?: string };
    const user = await getOrCreateDemoUser();
    const note = (body.note ?? "").trim();
    const workspace = await startThreadFromUpload({
      userId: user.id,
      imageUrl: body.imageUrl,
      note
    });

    return NextResponse.json(workspace);
  } catch (error) {
    const message = error instanceof AgentError ? error.message : "Failed to start thread.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
