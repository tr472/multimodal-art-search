import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AgentError } from "@/lib/errors";
import { getOrCreateDemoUser } from "@/lib/auth";
import { respondInThread } from "@/lib/chat";
import { buildSavedChatPreviews, buildThreadWorkspace } from "@/lib/threadWorkspace";

function parseMetadataObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

type StoredRecommendation = {
  id?: string;
  reason?: string;
};

function parseStoredRecommendations(value: unknown): StoredRecommendation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? (item as StoredRecommendation) : null))
    .filter((item): item is StoredRecommendation => Boolean(item));
}

export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const { threadId } = await params;
    const workspace = await buildThreadWorkspace(threadId);
    return NextResponse.json(workspace);
  } catch (error) {
    const message = error instanceof AgentError ? error.message : "Failed to load thread workspace.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const { threadId } = await params;
    const body = (await req.json()) as { message: string };
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    await respondInThread(threadId, message);
    const workspace = await buildThreadWorkspace(threadId);
    return NextResponse.json(workspace);
  } catch (error) {
    const message = error instanceof AgentError ? error.message : "Failed to send message.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const { threadId } = await params;
    const body = (await req.json()) as { action?: "save" | "discard" | "rename" | "undo"; title?: string };

    if (body.action === "save") {
      await prisma.chatThread.update({
        where: { id: threadId },
        data: { isSaved: true, discardedAt: null }
      });
    } else if (body.action === "undo") {
      const thread = await prisma.chatThread.findUnique({
        where: { id: threadId },
        include: {
          submission: { select: { id: true, imageUrl: true, rawNote: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 2 }
        }
      });

      if (!thread) {
        return NextResponse.json({ error: "Thread not found." }, { status: 404 });
      }

      const latest = thread.messages[0];
      if (!latest) {
        return NextResponse.json(await buildThreadWorkspace(threadId));
      }

      const idsToDelete = [latest.id];
      let turnStartedAt = latest.createdAt;
      let attachmentImageUrl: string | null = null;

      if (latest.role === "ASSISTANT") {
        const previous = thread.messages[1];
        if (previous?.role === "USER") {
          idsToDelete.push(previous.id);
          turnStartedAt = previous.createdAt;
          const metadata = parseMetadataObject(previous.metadataJson);
          const attachment = parseMetadataObject(metadata.attachment);
          attachmentImageUrl = typeof attachment.imageUrl === "string" ? attachment.imageUrl : null;
        }
      } else {
        const metadata = parseMetadataObject(latest.metadataJson);
        const attachment = parseMetadataObject(metadata.attachment);
        attachmentImageUrl = typeof attachment.imageUrl === "string" ? attachment.imageUrl : null;
      }

      await prisma.$transaction(async (tx) => {
        await tx.chatMessage.deleteMany({ where: { id: { in: idsToDelete } } });
        await tx.externalLookupResult.deleteMany({ where: { threadId, createdAt: { gte: turnStartedAt } } });

        if (attachmentImageUrl && attachmentImageUrl !== thread.submission.imageUrl) {
          await tx.threadImage.deleteMany({ where: { threadId, imageUrl: attachmentImageUrl } });
        }

        const remainingMessages = await tx.chatMessage.findMany({
          where: { threadId },
          orderBy: { createdAt: "asc" },
          select: { role: true, content: true, metadataJson: true }
        });

        const artistIds = new Set<string>();
        for (const message of remainingMessages) {
          const metadata = parseMetadataObject(message.metadataJson);
          for (const id of asStringArray(metadata.recommendedArtistIds)) artistIds.add(id);
        }

        await tx.threadArtistMention.deleteMany({ where: { threadId } });
        if (artistIds.size > 0) {
          await tx.threadArtistMention.createMany({
            data: [...artistIds].map((artistId) => ({ threadId, artistId }))
          });
        }

        const latestAssistant = [...remainingMessages].reverse().find((message) => message.role === "ASSISTANT");
        const latestAssistantMetadata = latestAssistant ? parseMetadataObject(latestAssistant.metadataJson) : {};

        await tx.recommendationEvent.deleteMany({ where: { submissionId: thread.submission.id } });

        const artworkRecommendations = parseStoredRecommendations(latestAssistantMetadata.recommendedArtworks);
        const artistRecommendations = parseStoredRecommendations(latestAssistantMetadata.recommendedArtists);

        let rank = 1;
        for (const record of artworkRecommendations) {
          if (!record.id) continue;
          await tx.recommendationEvent.create({
            data: {
              userId: thread.userId,
              submissionId: thread.submission.id,
              recommendedEntityType: "ARTWORK",
              recommendedEntityId: record.id,
              rank,
              reasonText: record.reason ?? "Recovered from the latest remaining assistant turn."
            }
          });
          rank += 1;
        }

        for (const record of artistRecommendations) {
          if (!record.id) continue;
          await tx.recommendationEvent.create({
            data: {
              userId: thread.userId,
              submissionId: thread.submission.id,
              recommendedEntityType: "ARTIST",
              recommendedEntityId: record.id,
              rank,
              reasonText: record.reason ?? "Recovered from the latest remaining assistant turn."
            }
          });
          rank += 1;
        }

        await tx.chatThread.update({
          where: { id: threadId },
          data: {
            summaryText: latestAssistant?.content.slice(0, 160) ?? null,
            title: thread.title ?? thread.submission.rawNote?.slice(0, 60) ?? "Untitled chat"
          }
        });
      });
    } else if (body.action === "discard") {
      const thread = await prisma.chatThread.findUnique({
        where: { id: threadId },
        select: { submissionId: true }
      });

      if (!thread) {
        return NextResponse.json({ error: "Thread not found." }, { status: 404 });
      }

      await prisma.submission.delete({ where: { id: thread.submissionId } });
      const user = await getOrCreateDemoUser();
      const savedChats = await buildSavedChatPreviews(user.id);
      return NextResponse.json({ discarded: true, savedChats });
    } else if (body.action === "rename") {
      await prisma.chatThread.update({
        where: { id: threadId },
        data: { title: body.title?.trim() || "Untitled chat" }
      });
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const workspace = await buildThreadWorkspace(threadId);
    return NextResponse.json(workspace);
  } catch (error) {
    const message = error instanceof AgentError ? error.message : "Failed to update thread.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
