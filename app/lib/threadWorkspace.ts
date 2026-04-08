import { prisma } from "@/lib/db";
import type { ArtistRecommendation, ArtworkRecommendation, MessageEvidence, SavedChatPreview, ThreadStatusBanner, ThreadWorkspace } from "@/types/chat";

type StoredRecommendation = {
  id?: string;
  title?: string;
  artistName?: string | null;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  dateText?: string | null;
  provenanceLabel?: string | null;
  sourceInstitution?: string | null;
  reason?: string;
  sourceKind?: "indexed_corpus" | "external_lookup";
  evidenceSummary?: string;
  uncertainty?: string;
};

function parseMetadataObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseStoredRecommendations(value: unknown): StoredRecommendation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? (item as StoredRecommendation) : null))
    .filter((item): item is StoredRecommendation => Boolean(item));
}

function parseAttachment(value: unknown): { imageUrl: string; role: "PRIMARY" | "SUPPORTING" | "DETAIL" | "WALL_LABEL" | "COMPARATIVE"; note: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const attachment = value as { imageUrl?: unknown; role?: unknown; note?: unknown };
  if (typeof attachment.imageUrl !== "string" || attachment.imageUrl.trim().length === 0) return null;
  if (
    attachment.role !== "PRIMARY" &&
    attachment.role !== "SUPPORTING" &&
    attachment.role !== "DETAIL" &&
    attachment.role !== "WALL_LABEL" &&
    attachment.role !== "COMPARATIVE"
  ) {
    return null;
  }
  return {
    imageUrl: attachment.imageUrl,
    role: attachment.role,
    note: typeof attachment.note === "string" ? attachment.note : null
  };
}

function parseMessageEvidence(value: unknown): MessageEvidence | null {
  if (!value || typeof value !== "object") return null;
  const metadata = value as { evidence?: Partial<MessageEvidence> };

  if (!metadata.evidence) return null;

  return {
    intent: metadata.evidence.intent ?? "recommendation",
    mode: metadata.evidence.mode ?? "indexed_corpus",
    whyThese: metadata.evidence.whyThese ?? "",
    uncertainty: metadata.evidence.uncertainty ?? "",
    sourceSummary: metadata.evidence.sourceSummary ?? "",
    functionalitySummary: metadata.evidence.functionalitySummary ?? "",
    confidence: metadata.evidence.confidence ?? "uncertain"
  };
}

function parseStatusBanner(value: unknown): ThreadStatusBanner | null {
  if (!value || typeof value !== "object") return null;
  const metadata = value as { planner?: unknown; evidence?: Partial<MessageEvidence> };
  const planner = parseMetadataObject(metadata.planner);
  const action = typeof planner.action === "string" ? planner.action : "";
  const rationale = Array.isArray(planner.rationale)
    ? planner.rationale.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const metFetchAttempted = Boolean(planner.metFetchAttempted);
  const evidenceMode = metadata.evidence?.mode ?? "indexed_corpus";

  if (action === "research" && metFetchAttempted) {
    return {
      label: "Queried The Met for this turn",
      detail: "The planner escalated to fresh external visuals before answering, so the current gallery reflects the updated search direction rather than the previous local match.",
      tone: "success"
    };
  }

  if (action === "research") {
    return {
      label: "Preparing external context for this turn",
      detail: "The planner chose outside research for this request because the user asked for specific works and local evidence alone was not enough.",
      tone: "info"
    };
  }

  if (action === "respond_with_limits") {
    return {
      label: "Context found, but not enough visual evidence yet",
      detail:
        rationale[0] ??
        "The response can still offer grounded era or style context, but the current gallery is being held back until stronger image-backed matches appear.",
      tone: "warning"
    };
  }

  if (evidenceMode === "external_lookup") {
    return {
      label: "Using external context to support this turn",
      detail: rationale[0] ?? "The local corpus was not strong enough on its own, so outside context was used for this turn.",
      tone: "info"
    };
  }

  return null;
}

function buildArtworkRecommendation(args: {
  artwork: {
    id: string;
    title: string;
    imageUrl: string | null;
    sourceUrl: string | null;
    dateText: string | null;
    metadataJson: unknown;
    institution: { name: string | null } | null;
    artist: { name: string | null } | null;
    externalSource: string;
  };
  reason: string;
  evidenceSummary: string;
  uncertainty: string;
}): ArtworkRecommendation {
  const metadata = parseMetadataObject(args.artwork.metadataJson);
  const rawPayload = parseMetadataObject(metadata.rawPayload);

  return {
    id: args.artwork.id,
    title: args.artwork.title,
    artistName: args.artwork.artist?.name ?? null,
    reason: args.reason,
    imageUrl: args.artwork.imageUrl,
    dateText: args.artwork.dateText,
    provenanceLabel:
      (typeof metadata.provenanceLabel === "string" && metadata.provenanceLabel) ||
      (typeof rawPayload.repository === "string" && rawPayload.repository) ||
      args.artwork.externalSource,
    sourceInstitution: args.artwork.institution?.name ?? null,
    sourceUrl: args.artwork.sourceUrl,
    sourceKind: "indexed_corpus",
    evidenceSummary: args.evidenceSummary,
    uncertainty: args.uncertainty
  };
}

function buildInlineArtworkRecommendation(record: StoredRecommendation): ArtworkRecommendation | null {
  if (!record.id || !record.title) return null;
  return {
    id: record.id,
    title: record.title,
    artistName: record.artistName ?? null,
    reason: record.reason ?? "Suggested in this turn.",
    imageUrl: record.imageUrl ?? null,
    dateText: record.dateText ?? null,
    provenanceLabel: record.provenanceLabel ?? (record.sourceKind === "external_lookup" ? "External lookup" : "Indexed corpus"),
    sourceInstitution: record.sourceInstitution ?? null,
    sourceUrl: record.sourceUrl ?? null,
    sourceKind: record.sourceKind ?? "indexed_corpus",
    evidenceSummary: record.evidenceSummary ?? "Suggested from the current assistant turn.",
    uncertainty: record.uncertainty ?? "This suggestion should be treated as contextual guidance."
  };
}

function buildArtistRecommendation(args: {
  artist: {
    id: string;
    name: string;
    bio: string | null;
  };
  reason: string;
  evidenceSummary: string;
  uncertainty: string;
}): ArtistRecommendation {
  return {
    id: args.artist.id,
    name: args.artist.name,
    bio: args.artist.bio,
    reason: args.reason,
    provenanceLabel: "indexed artist corpus",
    sourceKind: "indexed_corpus",
    evidenceSummary: args.evidenceSummary,
    uncertainty: args.uncertainty
  };
}

async function listSavedChats(userId: string): Promise<SavedChatPreview[]> {
  const savedThreads = await prisma.chatThread.findMany({
    where: {
      userId,
      isSaved: true,
      discardedAt: null
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
    include: {
      artworkMentions: {
        include: {
          artwork: true
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  return savedThreads.map((savedThread) => ({
    threadId: savedThread.id,
    submissionId: savedThread.submissionId,
    title: savedThread.title ?? "Saved chat",
    summaryText: savedThread.summaryText ?? "Saved art companion conversation.",
    updatedAt: savedThread.updatedAt.toISOString(),
    artworks: savedThread.artworkMentions.slice(0, 3).map((mention) => ({
      id: mention.artwork.id,
      title: mention.artwork.title,
      imageUrl: mention.artwork.imageUrl
    }))
  }));
}

function latestAssistantMetadata(messages: Array<{ role: "USER" | "ASSISTANT"; metadataJson: unknown }>) {
  const latestAssistant = [...messages].reverse().find((message) => message.role === "ASSISTANT");
  return latestAssistant ? parseMetadataObject(latestAssistant.metadataJson) : {};
}

export async function buildSavedChatPreviews(userId: string) {
  return listSavedChats(userId);
}

export async function buildThreadWorkspace(threadId: string): Promise<ThreadWorkspace> {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      submission: {
        include: {
          analysis: true
        }
      },
      messages: {
        orderBy: { createdAt: "asc" }
      },
      images: {
        orderBy: { createdAt: "asc" }
      },
      externalLookups: {
        orderBy: { createdAt: "desc" },
        take: 5
      },
      artworkMentions: {
        orderBy: { createdAt: "asc" },
        include: {
          artwork: {
            include: { artist: true, institution: true }
          }
        }
      },
      artistMentions: {
        orderBy: { createdAt: "asc" },
        include: {
          artist: true
        }
      }
    }
  });

  if (!thread) {
    throw new Error("Thread not found");
  }

  const messageArtworkIds = new Set<string>();
  const messageArtistIds = new Set<string>();

  for (const message of thread.messages) {
    const metadata = parseMetadataObject(message.metadataJson);
    for (const id of asStringArray(metadata.recommendedArtworkIds)) messageArtworkIds.add(id);
    for (const id of asStringArray(metadata.recommendedArtistIds)) messageArtistIds.add(id);
  }

  for (const mention of thread.artworkMentions) messageArtworkIds.add(mention.artworkId);
  for (const mention of thread.artistMentions) messageArtistIds.add(mention.artistId);

  const [artworks, artists] = await Promise.all([
    messageArtworkIds.size
      ? prisma.artwork.findMany({
          where: { id: { in: [...messageArtworkIds] } },
          include: { artist: true, institution: true }
        })
      : Promise.resolve([]),
    messageArtistIds.size ? prisma.artist.findMany({ where: { id: { in: [...messageArtistIds] } } }) : Promise.resolve([])
  ]);

  const artworkById = new Map(artworks.map((artwork) => [artwork.id, artwork]));
  const artistById = new Map(artists.map((artist) => [artist.id, artist]));
  const currentMetadata = latestAssistantMetadata(thread.messages);
  const currentArtworkRecords = parseStoredRecommendations(currentMetadata.recommendedArtworks);
  const currentArtistRecords = parseStoredRecommendations(currentMetadata.recommendedArtists);

  const currentArtworkRecommendations = currentArtworkRecords
    .map((record) => {
      if (!record.id) return null;
      const artwork = artworkById.get(record.id);
      if (!artwork) return buildInlineArtworkRecommendation(record);
      return buildArtworkRecommendation({
        artwork,
        reason: record.reason ?? "Mentioned in the current assistant reply.",
        evidenceSummary: record.evidenceSummary ?? "Indexed corpus match from the current turn.",
        uncertainty: record.uncertainty ?? "Suggested by resemblance and conversation context."
      });
    })
    .filter((item): item is ArtworkRecommendation => Boolean(item));

  const currentArtistRecommendations = currentArtistRecords
    .map((record) => {
      if (!record.id) return null;
      const artist = artistById.get(record.id);
      if (!artist) return null;
      return buildArtistRecommendation({
        artist,
        reason: record.reason ?? "Mentioned in the current assistant reply.",
        evidenceSummary: record.evidenceSummary ?? "Indexed corpus artist suggestion from the current turn.",
        uncertainty: record.uncertainty ?? "A related artist suggestion rather than a definitive attribution."
      });
    })
    .filter((item): item is ArtistRecommendation => Boolean(item));

  const savedChats = await listSavedChats(thread.submission.userId);

  return {
    threadId: thread.id,
    submissionId: thread.submissionId,
    threadTitle: thread.title ?? thread.submission.rawNote?.slice(0, 48) ?? "Untitled chat",
    isSaved: thread.isSaved,
    submissionNote: thread.submission.rawNote ?? "",
    submissionSummary: thread.submission.analysis?.modelSummary ?? "No analysis summary available yet.",
    statusBanner: parseStatusBanner(currentMetadata),
    messages: thread.messages.map((message) => {
      const metadata = parseMetadataObject(message.metadataJson);
      const artworkRecords = parseStoredRecommendations(metadata.recommendedArtworks);
      const artistRecords = parseStoredRecommendations(metadata.recommendedArtists);

      return {
        id: message.id,
        role: message.role,
        content: message.content,
        attachment: parseAttachment(parseMetadataObject(message.metadataJson).attachment),
        evidence: parseMessageEvidence(message.metadataJson),
        artworks: artworkRecords
          .map((record) => {
            if (!record.id) return null;
            const artwork = artworkById.get(record.id);
            if (!artwork) return buildInlineArtworkRecommendation(record);
            return buildArtworkRecommendation({
              artwork,
              reason: record.reason ?? "Mentioned in this part of the conversation.",
              evidenceSummary: record.evidenceSummary ?? "Indexed corpus match for this turn.",
              uncertainty: record.uncertainty ?? "Suggested by resemblance and conversation context."
            });
          })
          .filter((item): item is ArtworkRecommendation => Boolean(item)),
        artists: artistRecords
          .map((record) => {
            if (!record.id) return null;
            const artist = artistById.get(record.id);
            if (!artist) return null;
            return buildArtistRecommendation({
              artist,
              reason: record.reason ?? "Mentioned in this part of the conversation.",
              evidenceSummary: record.evidenceSummary ?? "Indexed corpus artist suggestion for this turn.",
              uncertainty: record.uncertainty ?? "A related artist suggestion rather than a definitive attribution."
            });
          })
          .filter((item): item is ArtistRecommendation => Boolean(item))
      };
    }),
    images: thread.images.map((image) => ({
      id: image.id,
      imageUrl: image.imageUrl,
      role: image.role,
      note: image.note
    })),
    artworks: currentArtworkRecommendations,
    artists: currentArtistRecommendations,
    galleryArtworks: thread.artworkMentions.map((mention) =>
      buildArtworkRecommendation({
        artwork: mention.artwork,
        reason: "Saved to your thread gallery.",
        evidenceSummary: "Persisted because you explicitly saved this work to the gallery.",
        uncertainty: "This appears in the gallery because you saved it, independent of changing assistant suggestions."
      })
    ),
    externalLookups: thread.externalLookups.map((lookup) => ({
      id: lookup.id,
      mode: lookup.mode,
      candidateTitle: lookup.candidateTitle,
      candidateArtist: lookup.candidateArtist,
      movementOrPeriod: lookup.movementOrPeriod,
      evidenceSummary: lookup.evidenceSummary,
      sourceUrls: Array.isArray(lookup.sourceUrls) ? (lookup.sourceUrls as string[]) : [],
      confidence: lookup.confidence,
      sourceLabel: lookup.sourceLabel
    })),
    savedChats
  };
}
