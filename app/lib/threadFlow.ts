import { prisma } from "@/lib/db";
import { analyzeSubmission } from "@/lib/analysis";
import { buildThreadWorkspace } from "@/lib/threadWorkspace";
import { respondInThread } from "@/lib/chat";

export async function startThreadFromUpload(args: { userId: string; imageUrl: string; note: string }) {
  const analysis = await analyzeSubmission(args.note, args.imageUrl);

  const submission = await prisma.submission.create({
    data: {
      userId: args.userId,
      imageUrl: args.imageUrl,
      rawNote: args.note,
      analysis: {
        create: {
          modelSummary: analysis.summary,
          detectedStyle: analysis.style,
          detectedSubjects: analysis.subjects,
          paletteNotes: analysis.paletteNotes,
          ocrText: analysis.ocrText ?? null,
          confidence: analysis.confidence,
          embedding: analysis.embedding
        }
      }
    }
  });

  const thread = await prisma.chatThread.create({
    data: {
      userId: args.userId,
      submissionId: submission.id,
      title: args.note.trim().slice(0, 60) || "Untitled chat"
    }
  });

  await prisma.threadImage.create({
    data: {
      threadId: thread.id,
      imageUrl: args.imageUrl,
      role: "PRIMARY",
      note: args.note || null
    }
  });

  const kickoffMessage = args.note || "Can you help me look closely at this artwork and find related works or artists?";
  await respondInThread(thread.id, kickoffMessage);

  return buildThreadWorkspace(thread.id);
}

export async function addImageToThread(args: {
  threadId: string;
  imageUrl: string;
  role: "PRIMARY" | "SUPPORTING" | "DETAIL" | "WALL_LABEL" | "COMPARATIVE";
  note: string;
}) {
  await prisma.threadImage.create({
    data: {
      threadId: args.threadId,
      imageUrl: args.imageUrl,
      role: args.role,
      note: args.note || null
    }
  });

  const rolePrompts: Record<typeof args.role, string> = {
    PRIMARY: "I've added a new primary image of the work.",
    SUPPORTING: "I've added a supporting image to give more context.",
    DETAIL: "I've added a detail image so you can look more closely.",
    WALL_LABEL: "I've added a wall label image to help with identification and context.",
    COMPARATIVE: "I've added a comparative image so you can compare the two works."
  };

  const message = args.note.trim() || rolePrompts[args.role];
  await respondInThread(args.threadId, message, {
    attachment: {
      imageUrl: args.imageUrl,
      role: args.role,
      note: args.note || null
    }
  });

  return buildThreadWorkspace(args.threadId);
}
