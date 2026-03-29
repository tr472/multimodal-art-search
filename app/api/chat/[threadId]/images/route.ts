import { NextResponse } from "next/server";
import { addImageToThread } from "@/lib/threadFlow";
import { getMaxUploadBytes, saveUploadedImage } from "@/lib/uploads";

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const formData = await req.formData();
  const file = formData.get("image");
  const role = String(formData.get("role") ?? "SUPPORTING") as "PRIMARY" | "SUPPORTING" | "DETAIL" | "WALL_LABEL" | "COMPARATIVE";
  const note = String(formData.get("note") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Please upload an image." }, { status: 400 });
  }

  if (file.size > getMaxUploadBytes()) {
    return NextResponse.json({ error: "Uploaded image is too large." }, { status: 400 });
  }

  const imageUrl = await saveUploadedImage(file);
  const workspace = await addImageToThread({
    threadId,
    imageUrl,
    role,
    note
  });

  return NextResponse.json(workspace);
}
