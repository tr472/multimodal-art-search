import { prisma } from "@/lib/db";
import { AgentError, ResearchError } from "@/lib/errors";
import { runResearchAgent } from "@/lib/metResearch";
import { updateTasteProfile } from "@/lib/personalization";
import { extractSemanticTags } from "@/lib/semanticTags";
import { planConversationTurn } from "@/lib/conversationPlanner";
import { runResponseAgent } from "@/lib/responseAgent";
import { runRetrievalAgent } from "@/lib/retrieval";
import { runRequestCharacterizationAgent } from "@/lib/requestCharacterizationAgent";
import { runTurnTuningAgent } from "@/lib/turnTuningAgent";

type RespondOptions = {
  attachment?: {
    imageUrl: string;
    role: "PRIMARY" | "SUPPORTING" | "DETAIL" | "WALL_LABEL" | "COMPARATIVE";
    note: string | null;
  };
};

const MISS_HINTS = ["not close", "none of these", "wrong direction", "off", "not right"];

function parseMetadataObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function collectPreviouslyPresentedArtworkIds(messages: Array<{ metadataJson: unknown }>) {
  const ids = new Set<string>();

  for (const message of messages) {
    const metadata = parseMetadataObject(message.metadataJson);

    for (const id of asStringArray(metadata.recommendedArtworkIds)) {
      ids.add(id);
    }

    const records = Array.isArray(metadata.recommendedArtworks) ? metadata.recommendedArtworks : [];
    for (const record of records) {
      if (!record || typeof record !== "object") continue;
      const id = (record as { id?: unknown }).id;
      if (typeof id === "string" && id.trim().length > 0) ids.add(id);
    }
  }

  return [...ids];
}

function priorMissCount(messages: Array<{ role: "USER" | "ASSISTANT"; content: string }>) {
  return messages
    .filter((message) => message.role === "USER")
    .reduce((count, message) => (MISS_HINTS.some((hint) => message.content.toLowerCase().includes(hint)) ? count + 1 : count), 0);
}

async function persistRecommendations(args: {
  threadId: string;
  submissionId: string;
  userId: string;
  artworks: Array<{ id: string; explanation: string }>;
  artists: Array<{ id: string; explanation: string }>;
}) {
  await prisma.recommendationEvent.deleteMany({ where: { submissionId: args.submissionId } });
  let rank = 1;
  for (const artwork of args.artworks) {
    await prisma.recommendationEvent.create({
      data: {
        userId: args.userId,
        submissionId: args.submissionId,
        recommendedEntityType: "ARTWORK",
        recommendedEntityId: artwork.id,
        rank,
        reasonText: artwork.explanation
      }
    });
    rank += 1;
  }
  for (const artist of args.artists) {
    await prisma.recommendationEvent.create({
      data: {
        userId: args.userId,
        submissionId: args.submissionId,
        recommendedEntityType: "ARTIST",
        recommendedEntityId: artist.id,
        rank,
        reasonText: artist.explanation
      }
    });
    rank += 1;
  }
}

export async function respondInThread(threadId: string, userMessage: string, options: RespondOptions = {}) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      submission: { include: { analysis: true } },
      messages: { orderBy: { createdAt: "asc" } },
      images: { orderBy: { createdAt: "asc" } },
      user: { include: { tasteProfile: true } }
    }
  });
  if (!thread) throw new AgentError("Thread not found.", { code: "THREAD_NOT_FOUND" });

  const createdUserMessage = await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: "USER",
      content: userMessage,
      metadataJson: options.attachment ? { attachment: options.attachment } : undefined
    }
  });
  await updateTasteProfile(thread.userId, userMessage);

  const threadMessages = [
    ...thread.messages.map((m) => ({ role: m.role, content: m.content, metadataJson: m.metadataJson })),
    { role: "USER" as const, content: createdUserMessage.content, metadataJson: createdUserMessage.metadataJson }
  ];
  const semanticSummary = [userMessage, thread.submission.rawNote ?? "", thread.submission.analysis?.modelSummary ?? ""].filter(Boolean).join(" ");
  const tags = extractSemanticTags(
    semanticSummary,
    thread.submission.analysis?.detectedStyle ?? "",
    (thread.submission.analysis?.detectedSubjects ?? []).join(" "),
    thread.submission.analysis?.paletteNotes ?? ""
  ).allTags;
  const plannerBeforeRetrieval = planConversationTurn({
    thread: { latestUserMessage: userMessage, messages: threadMessages },
    priorMisses: priorMissCount(threadMessages),
    retrievalResult: null
  });
  const characterization = await runRequestCharacterizationAgent({
    latestUserMessage: userMessage,
    recentMessages: threadMessages.map((m) => ({ role: m.role, content: m.content }))
  });
  const tuning = await runTurnTuningAgent({
    latestUserMessage: userMessage,
    recentMessages: threadMessages.map((m) => ({ role: m.role, content: m.content })),
    intentMode: plannerBeforeRetrieval.intentMode,
    priorMisses: priorMissCount(threadMessages)
  });
  const previouslyPresentedArtworkIds = collectPreviouslyPresentedArtworkIds(thread.messages);

  const retrieval = await runRetrievalAgent({
    embedding: Array.isArray(thread.submission.analysis?.embedding) ? (thread.submission.analysis?.embedding as number[]) : [],
    semanticSummary,
    tags,
    intentMode: plannerBeforeRetrieval.intentMode,
    priorMisses: priorMissCount(threadMessages),
    excludeArtworkIds: previouslyPresentedArtworkIds,
    tuning,
    characterization
  });
  const plannerAfterRetrieval = planConversationTurn({
    thread: { latestUserMessage: userMessage, messages: threadMessages },
    priorMisses: priorMissCount(threadMessages),
    retrievalResult: { artworks: retrieval.artworks.map((a) => ({ score: a.score })), matchReason: retrieval.matchReason }
  });

  let researchResult = null;
  if (plannerAfterRetrieval.action === "research") {
    try {
      researchResult = await runResearchAgent({
        query: userMessage,
        limit: 6,
        expectedArtists: characterization.requestedArtists
      });
    } catch (error) {
      if (!(error instanceof ResearchError)) throw error;
    }
  }

  const response = await runResponseAgent({
    thread: {
      submissionNote: thread.submission.rawNote ?? "",
      messages: threadMessages.map((m) => ({ role: m.role, content: m.content })),
      images: thread.images.map((image) => ({ role: image.role, note: image.note })),
      userTasteProfile: thread.user.tasteProfile
        ? {
            preferenceTags: thread.user.tasteProfile.preferenceTags,
            dislikedTags: thread.user.tasteProfile.dislikedTags,
            summaryText: thread.user.tasteProfile.summaryText
          }
        : null
    },
    analysisResult: {
      semanticSummary: thread.submission.analysis?.modelSummary ?? "",
      style: thread.submission.analysis?.detectedStyle ?? null,
      subjects: thread.submission.analysis?.detectedSubjects ?? [],
      paletteNotes: thread.submission.analysis?.paletteNotes ?? null,
      ocrText: thread.submission.analysis?.ocrText ?? null
    },
    retrievalResult: retrieval,
    researchResult,
    plannerDecision: plannerAfterRetrieval
  });

  const assistantMessage = await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: "ASSISTANT",
      content: response.message,
      metadataJson: {
        retrievalIntent: response.evidenceTrail.retrievalIntent,
        recommendedArtworkIds: response.gallery.recommendedArtworkIds,
        recommendedArtistIds: response.gallery.recommendedArtistIds,
        recommendedArtworks: response.gallery.recommendedArtworks.map((a) => ({
          id: a.id,
          title: a.title,
          artistName: a.artistName,
          imageUrl: a.imageUrl,
          sourceUrl: a.sourceUrl,
          dateText: a.dateText,
          provenanceLabel: a.provenanceLabel,
          sourceInstitution: a.sourceInstitution,
          reason: a.explanation,
          sourceKind: a.sourceKind,
          evidenceSummary: a.evidenceSummary,
          uncertainty: a.uncertaintySummary
        })),
        recommendedArtists: response.gallery.recommendedArtists.map((a) => ({
          id: a.id,
          reason: a.explanation,
          sourceKind: a.sourceKind,
          evidenceSummary: a.evidenceSummary,
          uncertainty: a.uncertaintySummary
        })),
        evidence: {
          intent: response.evidenceTrail.retrievalIntent,
          mode: "indexed_corpus",
          whyThese: response.evidenceTrail.whyThese,
          uncertainty: response.evidenceTrail.uncertainty,
          sourceSummary: response.evidenceTrail.sourceSummary,
          functionalitySummary: `Planner action: ${response.evidenceTrail.plannerAction}. Rationale: ${response.evidenceTrail.plannerRationale.join(" | ") || "(none)"}.`,
          confidence: response.evidenceTrail.confidence
        },
        planner: {
          action: response.evidenceTrail.plannerAction,
          rationale: response.evidenceTrail.plannerRationale,
          metFetchAttempted: response.evidenceTrail.metFetchAttempted,
          retrievalTuning: tuning,
          requestCharacterization: characterization
        }
      }
    }
  });

  await prisma.chatThread.update({
    where: { id: thread.id },
    data: {
      title: thread.title ?? (userMessage.trim().slice(0, 60) || "Untitled chat"),
      summaryText: response.message.slice(0, 160)
    }
  });
  await persistRecommendations({
    threadId: thread.id,
    submissionId: thread.submissionId,
    userId: thread.userId,
    artworks: retrieval.artworks.map((artwork) => ({ id: artwork.id, explanation: artwork.explanation })),
    artists: retrieval.artists.map((artist) => ({ id: artist.id, explanation: artist.explanation }))
  });

  return { assistantMessage, retrieval, structured: null, researchMode: "indexed_corpus", externalLookups: [] };
}
