import { prisma } from "@/lib/db";
import {
  blendEmbeddings,
  cosineSimilarity,
  textToCompatibleEmbedding
} from "@/lib/embeddings";
import { fetchPgvectorArtistCandidates, fetchPgvectorArtworkCandidates } from "@/lib/pgvector";
import {
  buildSubmissionSemanticText,
  extractSemanticTags,
  scoreTagOverlap,
  type SemanticTagBundle
} from "@/lib/semanticTags";
import type {
  ArtistCandidate,
  ArtworkCandidate,
  Embedding,
  EvidenceConfidence,
  RetrievalIntent,
  TurnRetrievalContext
} from "@/types/retrieval";

type RetrievalRouteArgs = {
  latestUserMessage: string;
  submissionNote?: string | null;
  analysisSummary?: string | null;
  styleHint?: string | null;
  ocrText?: string | null;
};

type RetrieveArgs = {
  latestUserMessage: string;
  submissionNote?: string | null;
  analysisSummary?: string | null;
  styleHint?: string | null;
  ocrText?: string | null;
  imageUrl?: string;
  userId: string;
  queryEmbedding?: Embedding;
  excludeArtworkIds?: string[];
  excludeArtistIds?: string[];
  artworkLimit?: number;
  artistLimit?: number;
};

type IndexedArtwork = Awaited<ReturnType<typeof loadIndexedCorpus>>["artworks"][number];
type IndexedArtist = Awaited<ReturnType<typeof loadIndexedCorpus>>["artists"][number];

const IDENTIFICATION_HINTS = [
  "who painted",
  "who made",
  "what is this",
  "identify",
  "title of this",
  "artist of this",
  "what painting is this",
  "who is the artist",
  "which painting",
  "is this by"
];

const CONTEXT_HINTS = [
  "tell me more about this work",
  "tell me more about this artist",
  "background",
  "context",
  "where is this from",
  "what does it mean",
  "museum label",
  "wall label"
];

const HISTORICAL_HINTS = [
  "what era",
  "what period",
  "what movement",
  "which movement",
  "historical",
  "when was this made",
  "is this impressionist",
  "is this baroque"
];

const RECOMMENDATION_HINTS = [
  "more like this",
  "similar",
  "related works",
  "recommend",
  "show me",
  "other works",
  "what else should i look at"
];

const TASTE_HINTS = [
  "mood",
  "palette",
  "color",
  "brushwork",
  "atmosphere",
  "i like",
  "i love",
  "steer",
  "lean into",
  "taste"
];

function lexicalScore(query: string, content: string): number {
  const q = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const c = content.toLowerCase();
  if (!q.length) return 0;
  const hits = q.filter((term) => c.includes(term)).length;
  return hits / q.length;
}

function asEmbedding(value: unknown): Embedding {
  return Array.isArray(value) ? (value as number[]) : [];
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseMetadataObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getArtworkSemanticTags(metadataJson: unknown): SemanticTagBundle {
  const metadata = parseMetadataObject(metadataJson);
  const semanticTags = parseMetadataObject(metadata.semanticTags);

  return {
    styleTags: asStringArray(semanticTags.styleTags),
    categoryTags: asStringArray(semanticTags.categoryTags),
    subjectTags: asStringArray(semanticTags.subjectTags),
    materialTags: asStringArray(semanticTags.materialTags),
    paletteTags: asStringArray(semanticTags.paletteTags),
    allTags: asStringArray(semanticTags.allTags)
  };
}

function getArtworkPeriodTags(metadataJson: unknown, dateText: string | null) {
  const metadata = parseMetadataObject(metadataJson);
  return Array.from(
    new Set(
      [metadata.period, metadata.culture, dateText]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
    )
  );
}

function getProvenanceLabel(externalSource: string, metadataJson: unknown) {
  const metadata = parseMetadataObject(metadataJson);
  const rawPayload = parseMetadataObject(metadata.rawPayload);
  return (
    (typeof metadata.provenanceLabel === "string" && metadata.provenanceLabel) ||
    (typeof rawPayload.repository === "string" && rawPayload.repository) ||
    externalSource
  );
}

function detectIntent(args: RetrievalRouteArgs): RetrievalIntent {
  const lowered = [
    args.latestUserMessage,
    args.submissionNote ?? "",
    args.analysisSummary ?? "",
    args.styleHint ?? "",
    args.ocrText ?? ""
  ]
    .join(" ")
    .toLowerCase();

  if (IDENTIFICATION_HINTS.some((hint) => lowered.includes(hint))) return "identification";
  if (CONTEXT_HINTS.some((hint) => lowered.includes(hint))) return "artist_context";
  if (HISTORICAL_HINTS.some((hint) => lowered.includes(hint))) return "historical_placement";
  if (RECOMMENDATION_HINTS.some((hint) => lowered.includes(hint))) return "recommendation";
  if (TASTE_HINTS.some((hint) => lowered.includes(hint))) return "taste_exploration";
  return "recommendation";
}

function getScoreWeights(intent: RetrievalIntent) {
  switch (intent) {
    case "identification":
      return { semantic: 0.3, lexical: 0.22, visual: 0.2, preference: 0.02, tags: 0.18, period: 0.08 };
    case "artist_context":
      return { semantic: 0.36, lexical: 0.16, visual: 0.16, preference: 0.06, tags: 0.18, period: 0.08 };
    case "historical_placement":
      return { semantic: 0.28, lexical: 0.14, visual: 0.14, preference: 0.04, tags: 0.22, period: 0.18 };
    case "taste_exploration":
      return { semantic: 0.24, lexical: 0.06, visual: 0.3, preference: 0.18, tags: 0.22, period: 0 };
    case "recommendation":
    default:
      return { semantic: 0.26, lexical: 0.08, visual: 0.32, preference: 0.16, tags: 0.18, period: 0 };
  }
}

function classifyConfidence(intent: RetrievalIntent, score: number, lexical: number, tagScore: number): EvidenceConfidence {
  if (intent === "identification" || intent === "artist_context" || intent === "historical_placement") {
    if (score >= 0.74 || (score >= 0.66 && lexical >= 0.32) || (score >= 0.68 && tagScore >= 0.35)) {
      return "identified_from_evidence";
    }
    if (score >= 0.52) {
      return "inferred_by_resemblance";
    }
    return "uncertain";
  }

  if (score >= 0.58) return "inferred_by_resemblance";
  return "uncertain";
}

function buildUncertaintySummary(intent: RetrievalIntent, confidence: EvidenceConfidence) {
  if (confidence === "identified_from_evidence") {
    return intent === "identification"
      ? "This looks well-supported by the evidence gathered for the uploaded work."
      : "This feels well-supported by the evidence gathered in this turn.";
  }
  if (confidence === "inferred_by_resemblance") {
    return "This is grounded in resemblance and context rather than a firm attribution.";
  }
  return "This direction is tentative and should be treated as inconclusive.";
}

function buildArtworkExplanation(args: {
  intent: RetrievalIntent;
  confidence: EvidenceConfidence;
  tags: string[];
  periodTags: string[];
  semanticScore: number;
  visualScore: number;
  tagScore: number;
  preferenceScore: number;
}) {
  if (args.intent === "identification") {
    if (args.confidence === "identified_from_evidence") {
      return "This is the strongest evidence-backed local match for the uploaded work.";
    }
    if (args.periodTags.length > 0) {
      return `This looks like a plausible match or close analogue because of its ${args.periodTags.slice(0, 2).join(" / ")} cues.`;
    }
    return "This is a resemblance-based lead rather than a firm identification.";
  }

  if (args.intent === "historical_placement" && args.periodTags.length > 0) {
    return `This helps place the work historically because it lines up with ${args.periodTags.slice(0, 2).join(" / ")} cues.`;
  }

  if (args.visualScore >= 0.55) {
    return "This feels related because the visual atmosphere and handling stay close to the uploaded work.";
  }

  if (args.tagScore >= 0.3 && args.tags.length > 0) {
    return `This feels related because it carries nearby ${args.tags.slice(0, 3).join(", ")} cues.`;
  }

  if (args.preferenceScore >= 0.35) {
    return "This is a good next step if the mood or sensibility you are after matters most.";
  }

  if (args.semanticScore >= 0.46) {
    return "This sits in a nearby conceptual lane to what the conversation is asking for.";
  }

  return "This is a wider adjacent suggestion rather than a tight match.";
}

function buildArtistExplanation(intent: RetrievalIntent, confidence: EvidenceConfidence, tagScore: number, score: number) {
  if (intent === "artist_context" || intent === "identification") {
    if (confidence === "identified_from_evidence") {
      return "This artist is the strongest evidence-backed fit for the work being discussed.";
    }
    return "This artist feels like a plausible attribution or close contextual match.";
  }
  if (tagScore >= 0.3) {
    return "This artist is a good follow if you want to stay with the same style or subject direction.";
  }
  if (score >= 0.5) {
    return "This artist offers a nearby historical or visual lineage to keep exploring.";
  }
  return "This is a broader artist suggestion to widen the conversation a little.";
}

function getArtworkScoreFloor(intent: RetrievalIntent) {
  switch (intent) {
    case "identification":
    case "artist_context":
    case "historical_placement":
      return 0.48;
    case "taste_exploration":
      return 0.5;
    case "recommendation":
    default:
      return 0.52;
  }
}

function getArtistScoreFloor(intent: RetrievalIntent) {
  switch (intent) {
    case "identification":
    case "artist_context":
      return 0.44;
    case "historical_placement":
      return 0.4;
    case "taste_exploration":
      return 0.46;
    case "recommendation":
    default:
      return 0.48;
  }
}

async function loadIndexedCorpus(args?: { artworkIds?: string[]; artistIds?: string[] }) {
  const [artworks, artists] = await Promise.all([
    prisma.artwork.findMany({
      where: args?.artworkIds?.length ? { id: { in: args.artworkIds } } : undefined,
      include: { artist: true, institution: true }
    }),
    prisma.artist.findMany({
      where: args?.artistIds?.length ? { id: { in: args.artistIds } } : undefined,
      include: { artworks: { select: { id: true } } }
    })
  ]);

  return { artworks, artists };
}

export async function retrieveRelated({
  latestUserMessage,
  submissionNote,
  analysisSummary,
  styleHint,
  ocrText,
  imageUrl,
  userId,
  queryEmbedding,
  excludeArtworkIds = [],
  excludeArtistIds = [],
  artworkLimit = 6,
  artistLimit = 4
}: RetrieveArgs): Promise<TurnRetrievalContext> {
  const profile = await prisma.userTasteProfile.findUnique({ where: { userId } });

  const intent = detectIntent({
    latestUserMessage,
    submissionNote,
    analysisSummary,
    styleHint,
    ocrText
  });
  const queryTags = extractSemanticTags(latestUserMessage, submissionNote, analysisSummary, styleHint, ocrText);
  const profileEmbedding = asEmbedding(profile?.embedding);
  const profileTags = profile?.preferenceTags ?? [];

  const queryText = [submissionNote, latestUserMessage, analysisSummary, styleHint, ocrText].filter(Boolean).join(" ");
  const semanticQueryText = buildSubmissionSemanticText({
    note: latestUserMessage,
    summary: [submissionNote, analysisSummary, styleHint, ocrText].filter(Boolean).join(" "),
    imageUrl,
    semanticTags: queryTags
  });

  const [queryTextEmbedding, semanticTextEmbedding] = await Promise.all([
    textToCompatibleEmbedding(queryText, queryEmbedding?.length),
    textToCompatibleEmbedding(semanticQueryText, queryEmbedding?.length)
  ]);
  const blendedQueryEmbedding = blendEmbeddings([queryEmbedding ?? [], queryTextEmbedding, semanticTextEmbedding]);
  const visualQueryEmbedding = imageUrl
    ? blendEmbeddings([queryEmbedding ?? [], semanticTextEmbedding])
    : [];
  const [artworkCandidateIds, artistCandidateIds] = await Promise.all([
    fetchPgvectorArtworkCandidates({
      textEmbedding: blendedQueryEmbedding,
      imageEmbedding: visualQueryEmbedding,
      excludeArtworkIds,
      limit: 96
    }),
    fetchPgvectorArtistCandidates({
      textEmbedding: blendedQueryEmbedding,
      excludeArtistIds,
      limit: 40
    })
  ]);
  const { artworks, artists } = await loadIndexedCorpus({
    artworkIds: artworkCandidateIds.length > 0 ? artworkCandidateIds : undefined,
    artistIds: artistCandidateIds.length > 0 ? artistCandidateIds : undefined
  });
  const effectiveQueryTags = Array.from(new Set([...queryTags.allTags, ...profileTags]));
  const weights = getScoreWeights(intent);
  const artworkScoreFloor = getArtworkScoreFloor(intent);
  const artistScoreFloor = getArtistScoreFloor(intent);

  const rankedArtworks = artworks
    .filter((artwork) => artwork.imageUrl && !excludeArtworkIds.includes(artwork.id))
    .map((artwork): ArtworkCandidate => {
      const textEmbedding = asEmbedding(artwork.textEmbedding);
      const imageEmbedding = asEmbedding(artwork.imageEmbedding);
      const artworkTags = getArtworkSemanticTags(artwork.metadataJson);
      const periodTags = getArtworkPeriodTags(artwork.metadataJson, artwork.dateText);
      const searchableText = [
        artwork.title,
        artwork.description ?? "",
        artwork.medium ?? "",
        artwork.dateText ?? "",
        artwork.artist?.name ?? "",
        artwork.institution?.name ?? "",
        ...artworkTags.allTags,
        ...periodTags
      ].join(" ");
      const semanticScore = cosineSimilarity(blendedQueryEmbedding, textEmbedding);
      const lexical = lexicalScore(queryText, searchableText);
      const visualScore = visualQueryEmbedding.length ? cosineSimilarity(visualQueryEmbedding, imageEmbedding) : 0;
      const preferenceScore = profileEmbedding.length ? cosineSimilarity(profileEmbedding, textEmbedding) : 0;
      const tagScore = scoreTagOverlap(effectiveQueryTags, artworkTags.allTags);
      const periodScore = scoreTagOverlap(queryTags.allTags, periodTags.map((tag) => tag.toLowerCase()));
      const totalScore =
        weights.semantic * semanticScore +
        weights.lexical * lexical +
        weights.visual * visualScore +
        weights.preference * preferenceScore +
        weights.tags * tagScore +
        weights.period * periodScore;
      const confidence = classifyConfidence(intent, totalScore, lexical, tagScore);

      return {
        id: artwork.id,
        title: artwork.title,
        description: artwork.description,
        artistName: artwork.artist?.name ?? null,
        institutionName: artwork.institution?.name ?? null,
        externalSource: artwork.externalSource,
        provenanceLabel: getProvenanceLabel(artwork.externalSource, artwork.metadataJson),
        sourceUrl: artwork.sourceUrl,
        imageUrl: artwork.imageUrl,
        dateText: artwork.dateText,
        styleTags: artworkTags.styleTags,
        periodTags,
        tags: artworkTags.allTags,
        textScore: semanticScore,
        imageScore: visualScore,
        tagScore,
        preferenceScore,
        lexicalScore: lexical,
        score: totalScore,
        explanation: buildArtworkExplanation({
          intent,
          confidence,
          tags: artworkTags.allTags,
          periodTags,
          semanticScore,
          visualScore,
          tagScore,
          preferenceScore
        }),
        evidenceSummary: `Indexed corpus match from ${getProvenanceLabel(artwork.externalSource, artwork.metadataJson)} with semantic, tag, and conversation overlap.`,
        confidenceLabel: confidence,
        uncertaintySummary: buildUncertaintySummary(intent, confidence),
        sourceKind: "indexed_corpus"
      };
    })
    .sort((a, b) => b.score - a.score)
    .filter((artwork, index) => {
      if (index === 0) return artwork.score >= artworkScoreFloor - 0.04;
      return artwork.score >= artworkScoreFloor;
    })
    .slice(0, artworkLimit);

  const rankedArtists = artists
    .filter((artist) => !excludeArtistIds.includes(artist.id))
    .map((artist): ArtistCandidate => {
      const artistTags = extractSemanticTags(artist.name, artist.bio);
      const artistEmbedding = asEmbedding(artist.textEmbedding);
      const semanticScore = cosineSimilarity(blendedQueryEmbedding, artistEmbedding);
      const lexical = lexicalScore(queryText, `${artist.name} ${artist.bio ?? ""} ${artistTags.allTags.join(" ")}`);
      const tagScore = scoreTagOverlap(effectiveQueryTags, artistTags.allTags);
      const relatedArtworkBoost = Math.min(artist.artworks.length / 10, 1) * 0.08;
      const score =
        (intent === "artist_context" || intent === "identification" ? 0.58 : 0.48) * semanticScore +
        0.16 * lexical +
        0.18 * tagScore +
        relatedArtworkBoost;
      const confidence = classifyConfidence(intent, score, lexical, tagScore);

      return {
        id: artist.id,
        name: artist.name,
        bio: artist.bio,
        provenanceLabel: "indexed artist corpus",
        relatedArtworkCount: artist.artworks.length,
        score,
        explanation: buildArtistExplanation(intent, confidence, tagScore, score),
        evidenceSummary: "Indexed artist corpus suggestion based on semantic proximity and nearby tagged works.",
        confidenceLabel: confidence,
        uncertaintySummary: buildUncertaintySummary(intent, confidence),
        sourceKind: "indexed_corpus"
      };
    })
    .sort((a, b) => b.score - a.score)
    .filter((artist, index) => {
      if (index === 0) return artist.score >= artistScoreFloor - 0.04;
      return artist.score >= artistScoreFloor;
    })
    .slice(0, artistLimit);

  const localEvidenceStrong = rankedArtworks[0]?.confidenceLabel === "identified_from_evidence" || (rankedArtworks[0]?.score ?? 0) >= 0.7;
  const supportedDirections = Array.from(
    new Set(
      rankedArtworks
        .flatMap((artwork) => [...artwork.styleTags, ...artwork.periodTags.map((tag) => tag.toLowerCase()), ...artwork.tags])
        .filter(Boolean)
    )
  ).slice(0, 8);
  const requestedDirections = extractSemanticTags(latestUserMessage).allTags;
  const blockedDirection = requestedDirections.find((tag) => !supportedDirections.includes(tag)) ?? null;
  const shouldUseExternalLookup =
    (intent === "identification" || intent === "artist_context" || intent === "historical_placement") && !localEvidenceStrong;

  return {
    intent,
    queryText,
    evidence: {
      localEvidenceStrong,
      shouldUseExternalLookup,
      supportedDirections,
      blockedDirection,
      summary: localEvidenceStrong
        ? "The indexed corpus returned a grounded direction for this turn."
        : "The indexed corpus returned only partial evidence for this turn."
    },
    artworks: rankedArtworks,
    artists: rankedArtists
  };
}
