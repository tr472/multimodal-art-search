import { NextResponse } from "next/server";
import { getOrCreateDemoUser } from "@/lib/auth";
import { startThreadFromUpload } from "@/lib/threadFlow";

export async function POST(req: Request) {
  const body = (await req.json()) as { imageUrl: string; note?: string };
  const user = await getOrCreateDemoUser();
  const note = (body.note ?? "").trim();
  const workspace = await startThreadFromUpload({
    userId: user.id,
    imageUrl: body.imageUrl,
    note
  });

  return NextResponse.json(workspace);
}
