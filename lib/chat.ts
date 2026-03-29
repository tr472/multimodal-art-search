import { prisma } from "@/lib/db";
import {
  chooseResearchMode,
  lookupExternalArtContext,
  type ConversationResearchMode,
  type ExternalLookupCandidate
} from "@/lib/externalLookup";
import { retrieveRelated } from "@/lib/retrieval";
import { updateTasteProfile } from "@/lib/personalization";
import { expandIndexedCorpusForVisualTurn } from "@/lib/uploadExpansion";

const ART_COMPANION_SYSTEM_PROMPT = `You are a thoughtful, perceptive AI art companion.

Your role is to help the user look closely, understand what can actually be supported by the evidence, and discover related art through conversation. You should sound warm, specific, grounded, and lightly educational. You are not just recommending art; you are helping the user notice, compare, and build taste with an attentive companion beside them. If the retrieved evidence is weak, say so plainly and gracefully instead of pretending certainty.

You may be given:
- the user's uploaded artwork image
- the user's note or question
- prior conversation in this thread
- retrieved artworks and artists from the indexed corpus
- optional external research results when local evidence is insufficient
- the user's taste profile
- a retrieval intent label for this turn

Rules:
- Keep claims constrained to the retrieved evidence
- Distinguish between:
  - identified from evidence
  - inferred by resemblance
  - uncertain / inconclusive
- Do not verbally pivot to a movement, artist, or style unless the retrieved results support that direction
- If the requested direction is weak in the indexed corpus, say that directly and stay with the directions that are supported
- Never hallucinate artist, title, date, or provenance
- Do not mention embeddings, scores, or ranking systems in the main answer
- When useful, teach gently by naming one concrete visual feature and explaining it in plain language
- Prefer helping the user look more carefully over dropping art-history jargon without explanation
- If the user is exploring taste, frame the next step as a small comparison or noticing exercise

Preferred structure:
- brief reading of the work or question that points to specific things to notice
- what can actually be supported
- a few aligned recommendations if present
- one follow-up question that helps the user refine what they love about the work

Only put technical evidence in the JSON fields, never in the main answer.`;

type StructuredAssistantResponse = {
  visualReading: string;
  groundedComparisons: string[];
  recommendations: Array<{
    type: "artwork" | "artist";
    name: string;
    reason: string;
  }>;
  whyThese: string;
  followUpQuestion: string;
  answer: string;
};

type RespondOptions = {
  attachment?: {
    imageUrl: string;
    role: "PRIMARY" | "SUPPORTING" | "DETAIL" | "WALL_LABEL" | "COMPARATIVE";
    note: string | null;
  };
};

const DISAGREEMENT_HINTS = [
  "not close",
  "don't think this is close",
  "doesn't feel close",
  "not similar",
  "not relevant",
  "not right",
  "don't like these",
  "these don't match",
  "this doesn't match",
  "unrelated"
];

const VISUAL_REQUEST_HINTS = [
  "could i see",
  "show me",
  "show them",
  "more examples",
  "more works",
  "can i see them"
];

function defaultStructuredResponse(): StructuredAssistantResponse {
  return {
    visualReading: "What stands out first is the overall mood and the way the paint seems to soften the edges of the forms.",
    groundedComparisons: [],
    recommendations: [],
    whyThese: "I stayed close to the strongest retrieved evidence for this turn.",
    followUpQuestion: "What feels most important here to you: the brushwork, the palette, or the quiet atmosphere?",
    answer:
      "What stands out first is the overall mood and the way the paint seems to soften the edges of the forms.\n\nI can keep following the work itself more closely, or branch outward only where the evidence stays grounded.\n\nWhat feels most important here to you: the brushwork, the palette, or the quiet atmosphere?"
  };
}

function parseAssistantResponse(content: string | null): StructuredAssistantResponse {
  if (!content) return defaultStructuredResponse();
  try {
    const parsed = JSON.parse(content) as Partial<StructuredAssistantResponse>;
    if (!parsed.answer || !parsed.followUpQuestion) return defaultStructuredResponse();
    return {
      visualReading: parsed.visualReading ?? "",
      groundedComparisons: parsed.groundedComparisons ?? [],
      recommendations: parsed.recommendations ?? [],
      whyThese: parsed.whyThese ?? "",
      followUpQuestion: parsed.followUpQuestion,
      answer: parsed.answer
    };
  } catch {
    return defaultStructuredResponse();
  }
}

function formatChatHistory(messages: Array<{ role: "USER" | "ASSISTANT"; content: string }>) {
  return messages.map((message) => `${message.role === "USER" ? "User" : "Assistant"}: ${message.content}`).join("\n");
}

function formatArtworkGrounding(
  artworks: Array<{
    title: string;
    artistName: string | null;
    institutionName: string | null;
    dateText: string | null;
    styleTags: string[];
    periodTags: string[];
    explanation: string;
    sourceUrl: string | null;
    provenanceLabel: string;
    confidenceLabel: string;
  }>
) {
  return artworks
    .map(
      (artwork, index) =>
        `${index + 1}. ${artwork.title} — artist: ${artwork.artistName ?? "Unknown"}; date: ${artwork.dateText ?? "Unknown"}; institution: ${
          artwork.institutionName ?? "Unknown"
        }; provenance: ${artwork.provenanceLabel}; confidence: ${artwork.confidenceLabel}; style tags: ${
          artwork.styleTags.join(", ") || "(none)"
        }; period tags: ${artwork.periodTags.join(", ") || "(none)"}; why it fits: ${artwork.explanation}; source url: ${
          artwork.sourceUrl ?? "(none)"
        }`
    )
    .join("\n");
}

function formatArtistGrounding(
  artists: Array<{
    name: string;
    explanation: string;
    bio: string | null;
    confidenceLabel: string;
    relatedArtworkCount: number;
  }>
) {
  return artists
    .map(
      (artist, index) =>
        `${index + 1}. ${artist.name} — confidence: ${artist.confidenceLabel}; indexed works: ${artist.relatedArtworkCount}; why they fit: ${
          artist.explanation
        }; bio: ${artist.bio ?? "(none)"}`
    )
    .join("\n");
}

function formatExternalFindings(findings: ExternalLookupCandidate[]) {
  return findings
    .map(
      (finding, index) =>
        `${index + 1}. candidate title: ${finding.candidateTitle ?? "(unknown)"}; candidate artist: ${
          finding.candidateArtist ?? "(unknown)"
        }; movement/period: ${finding.movementOrPeriod ?? "(unknown)"}; summary: ${finding.evidenceSummary}; sources: ${
          finding.sourceUrls.join(", ") || "(none)"
        }`
    )
    .join("\n");
}

function formatThreadImages(images: Array<{ role: string; note: string | null }>) {
  return images.map((image, index) => `${index + 1}. role: ${image.role}; note: ${image.note ?? "(none)"}`).join("\n");
}

function pickActiveImageUrl(args: {
  submissionImageUrl: string;
  threadImages: Array<{ imageUrl: string; role: string }>;
  attachment?: RespondOptions["attachment"];
}) {
  if (args.attachment && args.attachment.role !== "WALL_LABEL") {
    return args.attachment.imageUrl;
  }

  const latestVisualImage = [...args.threadImages].reverse().find((image) => image.role !== "WALL_LABEL");
  return latestVisualImage?.imageUrl ?? args.submissionImageUrl;
}

function buildEvidenceSummary(mode: ConversationResearchMode, lookups: ExternalLookupCandidate[], blockedDirection: string | null) {
  if (mode === "external_lookup" && lookups.length > 0) {
    const labels = Array.from(new Set(lookups.map((lookup) => lookup.sourceLabel)));
    return `Indexed corpus retrieval plus targeted external context from ${labels.join(", ")}.`;
  }

  if (blockedDirection) {
    return `Indexed corpus retrieval supports some nearby directions, but not a strong move toward ${blockedDirection}.`;
  }

  return "Indexed corpus retrieval grounded in the current conversation and image context.";
}

function buildFunctionalitySummary(args: {
  mode: ConversationResearchMode;
  retrieval: Awaited<ReturnType<typeof retrieveRelated>>;
  corpusExpansion?: { ingestedCount: number; queriesTried: string[] };
  disagreement: boolean;
  supplementedFromArtists: boolean;
  externalLookupCount: number;
}) {
  const parts = [
    `Intent routing classified this turn as ${args.retrieval.intent.replaceAll("_", " ")} and searched the broader indexed corpus rather than just the thread gallery.`,
    args.retrieval.artworks.length > 0
      ? `The engine kept ${args.retrieval.artworks.length} artwork result${args.retrieval.artworks.length === 1 ? "" : "s"} after applying relevance floors, so weak local matches were filtered instead of always being shown.`
      : "No artwork results survived the relevance floors, which means the corpus was too weak for a confident visual match.",
    args.corpusExpansion?.ingestedCount
      ? `Because local evidence was sparse, the upload-time expansion path fetched and embedded ${args.corpusExpansion.ingestedCount} additional records using OCR/style/context-derived queries before reranking.`
      : "",
    args.mode === "external_lookup" && args.externalLookupCount > 0
      ? `A targeted external lookup ran because local evidence alone was not strong enough for the requested move.`
      : "",
    args.disagreement
      ? "The previous recommendations were explicitly rejected by the user, so those artworks/artists were excluded from the next retrieval pass and removed from the discussed gallery."
      : "",
    args.supplementedFromArtists
      ? "The system also backfilled artworks by artists already discussed in the thread so artist-led follow-up requests could show actual paintings, not just artist names."
      : "",
    args.retrieval.evidence.blockedDirection
      ? `The corpus was still weak on the requested direction toward ${args.retrieval.evidence.blockedDirection}, so the assistant was instructed not to overclaim beyond supported evidence.`
      : ""
  ].filter(Boolean);

  return parts.join(" ");
}

function parseMetadataObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function hasWeakVisualSupport(retrieval: Awaited<ReturnType<typeof retrieveRelated>>) {
  return retrieval.artworks.length === 0 || (retrieval.artworks[0]?.score ?? 0) < 0.56;
}

function hasSparseVisualSupport(retrieval: Awaited<ReturnType<typeof retrieveRelated>>) {
  return retrieval.artworks.length < 3;
}

function userExpressesDisagreement(message: string) {
  const lowered = message.toLowerCase();
  return DISAGREEMENT_HINTS.some((hint) => lowered.includes(hint));
}

function userRequestsVisualExamples(message: string) {
  const lowered = message.toLowerCase();
  return VISUAL_REQUEST_HINTS.some((hint) => lowered.includes(hint));
}

function isVisualTurn(args: {
  existingMessages: Array<{ role: "USER" | "ASSISTANT" }>;
  attachment?: RespondOptions["attachment"];
}) {
  return args.existingMessages.every((message) => message.role !== "ASSISTANT") || Boolean(args.attachment);
}

function shouldExpandCorpusOnVisualTurn(args: {
  isVisualTurn: boolean;
  disagreement: boolean;
  wantsVisualExamples: boolean;
  sparseVisualSupport: boolean;
  weakVisualSupport: boolean;
  researchMode: ConversationResearchMode;
  topArtworkScore: number;
}) {
  if (args.disagreement) return true;
  if (args.wantsVisualExamples && (args.sparseVisualSupport || args.weakVisualSupport)) return true;
  if (!args.isVisualTurn) return false;
  if (args.researchMode === "external_lookup") return true;
  if (args.sparseVisualSupport) return true;
  return args.topArtworkScore < 0.58;
}

function getLatestAssistantRecommendationIds(messages: Array<{ role: "USER" | "ASSISTANT"; metadataJson?: unknown }>) {
  const latestAssistant = [...messages].reverse().find((message) => message.role === "ASSISTANT");
  if (!latestAssistant) {
    return { artworkIds: [] as string[], artistIds: [] as string[] };
  }

  const metadata = parseMetadataObject(latestAssistant.metadataJson);
  return {
    artworkIds: asStringArray(metadata.recommendedArtworkIds),
    artistIds: asStringArray(metadata.recommendedArtistIds)
  };
}

function wantsArtworksFromSharedArtists(message: string) {
  const lowered = message.toLowerCase();
  return (
    (lowered.includes("could i see") || lowered.includes("show me") || lowered.includes("show them")) &&
    (lowered.includes("paintings") || lowered.includes("works") || lowered.includes("artworks")) &&
    (lowered.includes("artists you shared") || lowered.includes("artists you mentioned") || lowered.includes("those artists") || lowered.includes("the artists"))
  );
}

async function supplementArtworkResultsFromArtists(args: {
  threadMessages: Array<{ role: "USER" | "ASSISTANT"; metadataJson?: unknown }>;
  excludedArtworkIds: string[];
  currentArtworkIds: string[];
}) {
  const { artistIds } = getLatestAssistantRecommendationIds(args.threadMessages);
  if (artistIds.length === 0) return [];

  const artworks = await prisma.artwork.findMany({
    where: {
      artistId: { in: artistIds },
      imageUrl: { not: null },
      id: { notIn: [...args.excludedArtworkIds, ...args.currentArtworkIds] }
    },
    include: {
      artist: true,
      institution: true
    },
    take: 6
  });

  return artworks.map((artwork) => {
    const metadata = parseMetadataObject(artwork.metadataJson);
    const rawPayload = parseMetadataObject(metadata.rawPayload);
    return {
      id: artwork.id,
      title: artwork.title,
      description: artwork.description,
      artistName: artwork.artist?.name ?? null,
      institutionName: artwork.institution?.name ?? null,
      externalSource: artwork.externalSource,
      provenanceLabel:
        (typeof metadata.provenanceLabel === "string" && metadata.provenanceLabel) ||
        (typeof rawPayload.repository === "string" && rawPayload.repository) ||
        artwork.externalSource,
      sourceUrl: artwork.sourceUrl,
      imageUrl: artwork.imageUrl,
      dateText: artwork.dateText,
      styleTags: [],
      periodTags: [],
      tags: [],
      textScore: 0.45,
      imageScore: 0.45,
      tagScore: 0.25,
      preferenceScore: 0.2,
      lexicalScore: 0.25,
      score: 0.58,
      explanation: `This is shown because it is an actual work by ${artwork.artist?.name ?? "the referenced artist"}, following your request to see paintings from the artists already discussed.`,
      evidenceSummary: `Indexed corpus artwork surfaced directly from the artist discussed earlier in the thread.`,
      confidenceLabel: "inferred_by_resemblance" as const,
      uncertaintySummary: "This is grounded by artist linkage in the conversation, though not necessarily the closest visual match in the corpus.",
      sourceKind: "indexed_corpus" as const
    };
  });
}

async function resolveStructuredArtists(names: string[]) {
  const normalized = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  if (normalized.length === 0) return [];

  const artists = await prisma.artist.findMany({
    where: {
      OR: normalized.map((name) => ({ name: { equals: name, mode: "insensitive" as const } }))
    }
  });

  const byLowerName = new Map(artists.map((artist) => [artist.name.toLowerCase(), artist]));
  return normalized
    .map((name) => byLowerName.get(name.toLowerCase()))
    .filter((artist): artist is NonNullable<typeof artist> => Boolean(artist));
}

async function removeRejectedMentions(args: {
  threadId: string;
  artworkIds: string[];
  artistIds: string[];
}) {
  if (args.artworkIds.length > 0) {
    await prisma.threadArtworkMention.deleteMany({
      where: {
        threadId: args.threadId,
        artworkId: { in: args.artworkIds }
      }
    });
  }

  if (args.artistIds.length > 0) {
    await prisma.threadArtistMention.deleteMany({
      where: {
        threadId: args.threadId,
        artistId: { in: args.artistIds }
      }
    });
  }
}

function dominantConfidenceLabel(labels: string[]) {
  if (labels.includes("identified_from_evidence")) return "identified_from_evidence" as const;
  if (labels.includes("inferred_by_resemblance")) return "inferred_by_resemblance" as const;
  return "uncertain" as const;
}

async function callOpenAIChat(payload: { systemPrompt: string; userPrompt: string }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.45,
        messages: [
          { role: "system", content: payload.systemPrompt },
          {
            role: "user",
            content: `${payload.userPrompt}\n\nReturn valid JSON with this schema:\n{\n  "visualReading": string,\n  "groundedComparisons": string[],\n  "recommendations": [{"type":"artwork|artist","name":string,"reason":string}],\n  "whyThese": string,\n  "followUpQuestion": string,\n  "answer": string\n}`
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      console.error(`OpenAI chat request failed (${response.status})`);
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return data.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    console.error("OpenAI chat request failed", error);
    return null;
  }
}

export async function respondInThread(threadId: string, userMessage: string, options: RespondOptions = {}) {
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
      user: {
        include: { tasteProfile: true }
      }
    }
  });

  if (!thread) {
    throw new Error("Thread not found");
  }

  const createdUserMessage = await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: "USER",
      content: userMessage,
      metadataJson: options.attachment
        ? {
            attachment: {
              role: options.attachment.role,
              note: options.attachment.note,
              imageUrl: options.attachment.imageUrl
            }
          }
        : undefined
    }
  });

  await updateTasteProfile(thread.userId, userMessage);

  const profile = await prisma.userTasteProfile.findUnique({ where: { userId: thread.userId } });
  const analysis = thread.submission.analysis;
  const disagreement = userExpressesDisagreement(userMessage);
  const wantsVisualExamples = userRequestsVisualExamples(userMessage);
  const excludedRecommendations = disagreement ? getLatestAssistantRecommendationIds(thread.messages) : { artworkIds: [], artistIds: [] };

  if (disagreement && (excludedRecommendations.artworkIds.length > 0 || excludedRecommendations.artistIds.length > 0)) {
    await removeRejectedMentions({
      threadId: thread.id,
      artworkIds: excludedRecommendations.artworkIds,
      artistIds: excludedRecommendations.artistIds
    });
  }

  const activeImageUrl = pickActiveImageUrl({
    submissionImageUrl: thread.submission.imageUrl,
    threadImages: thread.images,
    attachment: options.attachment
  });

  let retrieval = await retrieveRelated({
    latestUserMessage: userMessage,
    submissionNote: [thread.submission.rawNote, options.attachment?.note].filter(Boolean).join(" "),
    analysisSummary: analysis?.modelSummary ?? "",
    styleHint: analysis?.detectedStyle ?? "",
    ocrText: analysis?.ocrText ?? "",
    imageUrl: activeImageUrl,
    userId: thread.userId,
    queryEmbedding: Array.isArray(analysis?.embedding) ? (analysis.embedding as number[]) : undefined,
    excludeArtworkIds: excludedRecommendations.artworkIds,
    excludeArtistIds: excludedRecommendations.artistIds,
    artworkLimit: 6,
    artistLimit: 4
  });

  let researchMode = chooseResearchMode({ retrieval });
  const visualTurn = isVisualTurn({ existingMessages: thread.messages, attachment: options.attachment });
  const sparseVisualSupport = hasSparseVisualSupport(retrieval);
  const weakVisualSupport = hasWeakVisualSupport(retrieval);
  let corpusExpansion:
    | {
        attempted: boolean;
        ingestedCount: number;
        queriesTried: string[];
      }
    | undefined;

  if (
    shouldExpandCorpusOnVisualTurn({
      isVisualTurn: visualTurn,
      disagreement,
      wantsVisualExamples,
      sparseVisualSupport,
      weakVisualSupport,
      researchMode,
      topArtworkScore: retrieval.artworks[0]?.score ?? 0
    })
  ) {
    corpusExpansion = await expandIndexedCorpusForVisualTurn({
      latestUserMessage: userMessage,
      submissionNote: [thread.submission.rawNote, options.attachment?.note].filter(Boolean).join(" "),
      analysisSummary: analysis?.modelSummary ?? "",
      styleHint: analysis?.detectedStyle ?? "",
      ocrText: analysis?.ocrText ?? "",
      subjects: analysis?.detectedSubjects ?? [],
      intent: retrieval.intent
    });

  if (corpusExpansion.ingestedCount > 0) {
      retrieval = await retrieveRelated({
        latestUserMessage: userMessage,
        submissionNote: [thread.submission.rawNote, options.attachment?.note].filter(Boolean).join(" "),
        analysisSummary: analysis?.modelSummary ?? "",
        styleHint: analysis?.detectedStyle ?? "",
        ocrText: analysis?.ocrText ?? "",
        imageUrl: activeImageUrl,
        userId: thread.userId,
        queryEmbedding: Array.isArray(analysis?.embedding) ? (analysis.embedding as number[]) : undefined,
        excludeArtworkIds: excludedRecommendations.artworkIds,
        excludeArtistIds: excludedRecommendations.artistIds,
        artworkLimit: 6,
        artistLimit: 4
      });
      researchMode = chooseResearchMode({ retrieval });
    }
  }

  if (wantsArtworksFromSharedArtists(userMessage) && retrieval.artworks.length < 3) {
    const supplementalArtworks = await supplementArtworkResultsFromArtists({
      threadMessages: thread.messages,
      excludedArtworkIds: excludedRecommendations.artworkIds,
      currentArtworkIds: retrieval.artworks.map((artwork) => artwork.id)
    });

    if (supplementalArtworks.length > 0) {
      retrieval = {
        ...retrieval,
        artworks: [...retrieval.artworks, ...supplementalArtworks].slice(0, 6),
        evidence: {
          ...retrieval.evidence,
          summary: `${retrieval.evidence.summary} The turn also pulled actual artworks by artists already discussed in the thread.`
        }
      };
    }
  }
  const supplementedFromArtists = wantsArtworksFromSharedArtists(userMessage) && retrieval.artworks.length > 0;

  const shouldForceLookup = disagreement || ((wantsVisualExamples || retrieval.intent === "taste_exploration") && hasSparseVisualSupport(retrieval));
  const effectiveResearchMode = shouldForceLookup ? ("external_lookup" as const) : researchMode;

  const externalLookups =
    effectiveResearchMode === "indexed_corpus"
      ? []
      : await lookupExternalArtContext({
          queryText: retrieval.queryText,
          ocrText: analysis?.ocrText ?? "",
          topArtworkTitle: retrieval.artworks[0]?.title ?? null,
          topArtistName: retrieval.artists[0]?.name ?? retrieval.artworks[0]?.artistName ?? null
        });

  for (const lookup of externalLookups) {
    await prisma.externalLookupResult.create({
      data: {
        threadId: thread.id,
        mode: lookup.mode,
        queryText: userMessage,
        candidateTitle: lookup.candidateTitle,
        candidateArtist: lookup.candidateArtist,
        movementOrPeriod: lookup.movementOrPeriod,
        evidenceSummary: lookup.evidenceSummary,
        sourceUrls: lookup.sourceUrls,
        confidence: lookup.confidence,
        sourceLabel: lookup.sourceLabel
      }
    });
  }

  const priorHistory = formatChatHistory([
    ...thread.messages.map((message) => ({ role: message.role, content: message.content })),
    { role: createdUserMessage.role, content: createdUserMessage.content }
  ]);

  const userPrompt = `Turn intent: ${retrieval.intent}

User submission context:
- original user note: ${thread.submission.rawNote || "(none)"}
- submission analysis:
  - visual summary: ${analysis?.modelSummary ?? "No submission analysis available"}
  - style hint: ${analysis?.detectedStyle ?? "(none)"}
  - subject tags: ${(analysis?.detectedSubjects ?? []).join(", ") || "(none)"}
  - palette notes: ${analysis?.paletteNotes || "(none)"}
  - OCR text: ${analysis?.ocrText || "(none)"}

Current thread images:
${formatThreadImages([...thread.images, ...(options.attachment ? [{ role: options.attachment.role, note: options.attachment.note }] : [])]) || "(none)"}

User taste profile:
- liked attributes: ${(profile?.preferenceTags ?? []).join(", ") || "(none)"}
- disliked attributes: ${(profile?.dislikedTags ?? []).join(", ") || "(none)"}
- profile summary: ${profile?.summaryText ?? "(none)"}

Evidence guidance:
- indexed corpus summary: ${retrieval.evidence.summary}
- supported directions: ${retrieval.evidence.supportedDirections.join(", ") || "(none)"}
- unsupported requested direction: ${retrieval.evidence.blockedDirection ?? "(none)"}
- use external lookup: ${effectiveResearchMode === "external_lookup" ? "yes" : "no"}
- upload-time corpus expansion: ${
    corpusExpansion
      ? `${corpusExpansion.ingestedCount} records added via ${corpusExpansion.queriesTried.join(" | ")}`
      : "not used"
  }

Retrieved artworks:
${formatArtworkGrounding(retrieval.artworks) || "(none)"}

Retrieved artists:
${formatArtistGrounding(retrieval.artists) || "(none)"}

External findings:
${formatExternalFindings(externalLookups) || "(none)"}

Prior conversation:
${priorHistory || "(none yet)"}

Current user message:
${userMessage}`;

  const openAIContent = await callOpenAIChat({
    systemPrompt: ART_COMPANION_SYSTEM_PROMPT,
    userPrompt
  });

  const structured = parseAssistantResponse(openAIContent);
  const structuredArtistNames = structured.recommendations
    .filter((recommendation) => recommendation.type === "artist")
    .map((recommendation) => recommendation.name);
  const resolvedStructuredArtists = await resolveStructuredArtists(structuredArtistNames);
  const assistantContent = structured.answer.trim() || defaultStructuredResponse().answer;
  const recommendedArtworkIds = retrieval.artworks.map((artwork) => artwork.id);
  const recommendedArtistIds = Array.from(
    new Set([...retrieval.artists.map((artist) => artist.id), ...resolvedStructuredArtists.map((artist) => artist.id)])
  );
  const recommendedArtworks = retrieval.artworks.map((artwork) => ({
    id: artwork.id,
    reason: artwork.explanation,
    sourceKind: artwork.sourceKind,
    evidenceSummary: artwork.evidenceSummary,
    uncertainty: artwork.uncertaintySummary
  }));
  const recommendedArtists = [
    ...retrieval.artists.map((artist) => ({
      id: artist.id,
      reason: artist.explanation,
      sourceKind: artist.sourceKind,
      evidenceSummary: artist.evidenceSummary,
      uncertainty: artist.uncertaintySummary
    })),
    ...resolvedStructuredArtists
      .filter((artist) => !retrieval.artists.some((candidate) => candidate.id === artist.id))
      .map((artist) => ({
        id: artist.id,
        reason: "Named directly in the assistant reply and resolved against the indexed artist corpus.",
        sourceKind: "indexed_corpus" as const,
        evidenceSummary: "Indexed artist resolved from the assistant's grounded recommendation text.",
        uncertainty: "This artist was named in the reply and matched to the local corpus for follow-up retrieval."
      }))
  ];

  const assistantMessage = await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: "ASSISTANT",
      content: assistantContent,
      metadataJson: {
        retrievalIntent: retrieval.intent,
        recommendedArtworkIds,
        recommendedArtistIds,
        recommendedArtworks,
        recommendedArtists,
        evidence: {
          intent: retrieval.intent,
          mode: effectiveResearchMode,
          whyThese: structured.whyThese || "These suggestions stay close to the strongest supported evidence from this turn.",
          uncertainty:
            effectiveResearchMode === "external_lookup"
              ? "External context can help, but any identification remains provisional unless the evidence converges strongly."
              : hasWeakVisualSupport(retrieval)
                ? "The current indexed corpus is weak for a visually close match, so the assistant stayed more cautious than usual."
              : retrieval.artworks[0]?.uncertaintySummary ?? "These are related suggestions, not firm attributions.",
          sourceSummary: [
            buildEvidenceSummary(effectiveResearchMode, externalLookups, retrieval.evidence.blockedDirection),
            disagreement ? "The last set of visual suggestions was explicitly rejected, so those results were excluded and the engine searched for a different direction." : "",
            corpusExpansion?.ingestedCount
              ? `The initial visual turn expanded the indexed corpus with ${corpusExpansion.ingestedCount} targeted records before reranking.`
              : ""
          ]
            .filter(Boolean)
            .join(" "),
          functionalitySummary: buildFunctionalitySummary({
            mode: effectiveResearchMode,
            retrieval,
            corpusExpansion,
            disagreement,
            supplementedFromArtists,
            externalLookupCount: externalLookups.length
          }),
          confidence: dominantConfidenceLabel(retrieval.artworks.map((artwork) => artwork.confidenceLabel))
        }
      }
    }
  });

  await prisma.chatThread.update({
    where: { id: thread.id },
    data: {
      title: thread.title ?? (userMessage.trim().slice(0, 60) || "Untitled chat"),
      summaryText: assistantContent.slice(0, 160)
    }
  });

  await prisma.recommendationEvent.deleteMany({ where: { submissionId: thread.submissionId } });

  let rank = 1;
  for (const artwork of retrieval.artworks) {
    await prisma.threadArtworkMention.upsert({
      where: {
        threadId_artworkId: {
          threadId: thread.id,
          artworkId: artwork.id
        }
      },
      update: {},
      create: {
        threadId: thread.id,
        artworkId: artwork.id
      }
    });

    await prisma.recommendationEvent.create({
      data: {
        userId: thread.userId,
        submissionId: thread.submissionId,
        recommendedEntityType: "ARTWORK",
        recommendedEntityId: artwork.id,
        rank,
        reasonText: artwork.explanation
      }
    });
    rank += 1;
  }

  for (const artist of retrieval.artists) {
    await prisma.threadArtistMention.upsert({
      where: {
        threadId_artistId: {
          threadId: thread.id,
          artistId: artist.id
        }
      },
      update: {},
      create: {
        threadId: thread.id,
        artistId: artist.id
      }
    });

    await prisma.recommendationEvent.create({
      data: {
        userId: thread.userId,
        submissionId: thread.submissionId,
        recommendedEntityType: "ARTIST",
        recommendedEntityId: artist.id,
        rank,
        reasonText: artist.explanation
      }
    });
    rank += 1;
  }

  for (const artist of resolvedStructuredArtists) {
    await prisma.threadArtistMention.upsert({
      where: {
        threadId_artistId: {
          threadId: thread.id,
          artistId: artist.id
        }
      },
      update: {},
      create: {
        threadId: thread.id,
        artistId: artist.id
      }
    });
  }

  return { assistantMessage, retrieval, structured, researchMode: effectiveResearchMode, externalLookups };
}
