"use server";

import { revalidatePath } from "next/cache";
import { getOrCreateDemoUser } from "@/lib/auth";
import { startThreadFromUpload } from "@/lib/threadFlow";
import { getMaxUploadBytes, saveUploadedImage } from "@/lib/uploads";
import type { ThreadWorkspace } from "@/types/chat";

export async function createSubmissionAction(
  _prevState: { message: string; submissionId: string; threadId: string; workspace: ThreadWorkspace | null },
  formData: FormData
) {
  const file = formData.get("image");
  const note = String(formData.get("note") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return { message: "Please upload an image.", submissionId: "", threadId: "", workspace: null };
  }

  const maxUploadBytes = getMaxUploadBytes();
  if (file.size > maxUploadBytes) {
    const maxUploadMb = Math.floor(maxUploadBytes / (1024 * 1024));
    return {
      message: `Please upload an image smaller than ${maxUploadMb} MB.`,
      submissionId: "",
      threadId: "",
      workspace: null
    };
  }

  const imageUrl = await saveUploadedImage(file);
  const user = await getOrCreateDemoUser();
  const workspace = await startThreadFromUpload({
    userId: user.id,
    imageUrl,
    note
  });

  revalidatePath("/");

  return {
    message: `Started a live conversation with ${workspace.artworks.length} artwork and ${workspace.artists.length} artist suggestions.`,
    submissionId: workspace.submissionId,
    threadId: workspace.threadId,
    workspace
  };
}
