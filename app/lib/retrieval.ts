import { appConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { RetrievalError } from "@/lib/errors";
import { blendEmbeddings, cosineSimilarity, textToCompatibleEmbedding } from "@/lib/embeddings";
import { fetchPgvectorArtistCandidates, fetchPgvectorArtworkCandidates } from "@/lib/pgvector";
import type { RequestCharacterization } from "@/lib/requestCharacterizationAgent";
import { extractSemanticTags, scoreTagOverlap, type SemanticTagBundle } from "@/lib/semanticTags";
import type { RetrievalTuning } from "@/lib/turnTuningAgent";
import type { ArtistCandidate, ArtworkCandidate, Embedding, EvidenceConfidence, RetrievalIntent } from "@/types/retrieval";

type IndexedArtwork = Awaited<ReturnType<typeof loadIndexedCorpus>>["artworks"][number];
type IndexedArtist = Awaited<ReturnType<typeof loadIndexedCorpus>>["artists"][number];

export type RetrievalAgentInput = {
  embedding: Embedding;
  semanticSummary: string;
  tags: string[];
  intentMode: RetrievalIntent;
  priorMisses: number;
  excludeArtworkIds?: string[];
  excludeArtistIds?: string[];
  artworkLimit?: number;
  artistLimit?: number;
  tuning?: RetrievalTuning;
  characterization?: RequestCharacterization;
};

export type RetrievalAgentOutput = {
  artworks: ArtworkCandidate[];
  artists: ArtistCandidate[];
  matchReason: {
    localEvidenceStrong: boolean;
    supportedDirections: string[];
    blockedDirection: string | null;
    summary: string;
  };
};

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

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values));
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

function getScoreWeights(intent: RetrievalIntent) {
  return appConfig.retrieval.weights[intent] ?? appConfig.retrieval.weights.recommendation;
}

function applyWeightBias(
  base: { semantic: number; lexical: number; visual: number; tags: number; period: number },
  tuning?: RetrievalTuning
) {
  if (!tuning) return base;
  const raw = {
    semantic: Math.max(0, base.semantic + tuning.weightBias.semantic),
    lexical: Math.max(0, base.lexical + tuning.weightBias.lexical),
    visual: Math.max(0, base.visual + tuning.weightBias.visual),
    tags: Math.max(0, base.tags + tuning.weightBias.tags),
    period: Math.max(0, base.period + tuning.weightBias.period)
  };
  const sum = raw.semantic + raw.lexical + raw.visual + raw.tags + raw.period || 1;
  return {
    semantic: raw.semantic / sum,
    lexical: raw.lexical / sum,
    visual: raw.visual / sum,
    tags: raw.tags / sum,
    period: raw.period / sum
  };
}

function expandIntentTags(queryText: string, baseTags: string[]) {
  const haystack = `${queryText} ${baseTags.join(" ")}`.toLowerCase();
  const additions: string[] = [];

  if (haystack.includes("impression")) {
    additions.push(
      "impressionism",
      "impressionist",
      "monet",
      "manet",
      "renoir",
      "morisot",
      "pissarro",
      "degas",
      "sisley",
      "caillebotte",
      "cassatt"
    );
  }

  if (haystack.includes("post-impression") || haystack.includes("post impression")) {
    additions.push("post-impressionism", "van gogh", "gauguin", "cezanne", "seurat", "signac");
  }

  if (haystack.includes("ukiyo") || haystack.includes("hokusai") || haystack.includes("edo")) {
    additions.push("ukiyo-e", "hokusai", "hiroshige", "utamaro", "woodblock print", "edo period japanese print");
  }

  return dedupeStrings([...baseTags, ...additions]);
}

function matchesRequestedArtist(artistName: string | null, requestedArtists: string[]) {
  if (!artistName || requestedArtists.length === 0) return false;
  const normalized = artistName.toLowerCase();
  return requestedArtists.some((candidate) => normalized.includes(candidate.toLowerCase()));
}

function classifyConfidence(intent: RetrievalIntent, score: number, lexical: number, tagScore: number): EvidenceConfidence {
  if (intent === "identification" || intent === "artist_context" || intent === "historical_placement") {
    if (score >= 0.74 || (score >= 0.66 && lexical >= 0.32) || (score >= 0.68 && tagScore >= 0.35)) return "identified_from_evidence";
    if (score >= 0.52) return "inferred_by_resemblance";
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
  if (confidence === "inferred_by_resemblance") return "This is grounded in resemblance and context rather than a firm attribution.";
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
}) {
  if (args.intent === "identification") {
    if (args.confidence === "identified_from_evidence") return "This is the strongest evidence-backed local match for the uploaded work.";
    if (args.periodTags.length > 0) return `This looks like a plausible match because of ${args.periodTags.slice(0, 2).join(" / ")} cues.`;
    return "This is a resemblance-based lead rather than a firm identification.";
  }
  if (args.intent === "historical_placement" && args.periodTags.length > 0) {
    return `This helps place the work historically because it lines up with ${args.periodTags.slice(0, 2).join(" / ")} cues.`;
  }
  if (args.visualScore >= 0.55) return "This feels related because the visual atmosphere and handling stay close to the uploaded work.";
  if (args.tagScore >= 0.3 && args.tags.length > 0) return `This feels related because it carries nearby ${args.tags.slice(0, 3).join(", ")} cues.`;
  if (args.semanticScore >= 0.46) return "This sits in a nearby conceptual lane to what the conversation is asking for.";
  return "This is a wider adjacent suggestion rather than a tight match.";
}

function buildArtistExplanation(intent: RetrievalIntent, confidence: EvidenceConfidence, tagScore: number, score: number) {
  if (intent === "artist_context" || intent === "identification") {
    if (confidence === "identified_from_evidence") return "This artist is the strongest evidence-backed fit for the work being discussed.";
    return "This artist feels like a plausible attribution or close contextual match.";
  }
  if (tagScore >= 0.3) return "This artist is a good follow if you want to stay with the same style or subject direction.";
  if (score >= 0.5) return "This artist offers a nearby historical or visual lineage to keep exploring.";
  return "This is a broader artist suggestion to widen the conversation a little.";
}

function getArtworkScoreFloor(intent: RetrievalIntent, priorMisses: number) {
  const relaxed = Math.min(priorMisses, 2) * 0.02;
  return (appConfig.retrieval.scoreFloors.artwork[intent] ?? appConfig.retrieval.scoreFloors.artwork.recommendation) - relaxed;
}

function getArtistScoreFloor(intent: RetrievalIntent, priorMisses: number) {
  const relaxed = Math.min(priorMisses, 2) * 0.02;
  return (appConfig.retrieval.scoreFloors.artist[intent] ?? appConfig.retrieval.scoreFloors.artist.recommendation) - relaxed;
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

export async function runRetrievalAgent(input: RetrievalAgentInput): Promise<RetrievalAgentOutput> {
  try {
    const queryText = input.semanticSummary.trim();
    const queryTags = expandIntentTags(
      queryText,
      Array.from(new Set(input.tags.map((tag) => tag.toLowerCase())))
    );
    const requestedStyleTags = input.characterization?.requestedStyles.map((tag) => tag.toLowerCase()) ?? [];
    const requestedSubjectTags = input.characterization?.requestedSubjects.map((tag) => tag.toLowerCase()) ?? [];
    const effectiveQueryTags = dedupeStrings([...queryTags, ...requestedStyleTags, ...requestedSubjectTags]);
    const semanticTags = extractSemanticTags(input.semanticSummary, queryTags.join(" "));
    const queryEmbeddingFromText = await textToCompatibleEmbedding(queryText, input.embedding.length || undefined);
    const blendedQueryEmbedding = blendEmbeddings([input.embedding, queryEmbeddingFromText]);
    const [artworkCandidateIds, artistCandidateIds] = await Promise.all([
      fetchPgvectorArtworkCandidates({
        textEmbedding: blendedQueryEmbedding,
        imageEmbedding: input.embedding,
        excludeArtworkIds: input.excludeArtworkIds ?? [],
        limit: appConfig.retrieval.pgvectorArtworkCandidateLimit
      }),
      fetchPgvectorArtistCandidates({
        textEmbedding: blendedQueryEmbedding,
        excludeArtistIds: input.excludeArtistIds ?? [],
        limit: appConfig.retrieval.pgvectorArtistCandidateLimit
      })
    ]);
    const { artworks, artists } = await loadIndexedCorpus({
      artworkIds: artworkCandidateIds.length > 0 ? artworkCandidateIds : undefined,
      artistIds: artistCandidateIds.length > 0 ? artistCandidateIds : undefined
    });
    const forcedArtistNames = input.characterization?.requestedArtists ?? [];
    const forcedArtistArtworks =
      forcedArtistNames.length > 0
        ? await prisma.artwork.findMany({
            where: {
              OR: forcedArtistNames.map((name) => ({
                artist: {
                  name: {
                    contains: name,
                    mode: "insensitive"
                  }
                }
              }))
            },
            include: { artist: true, institution: true },
            take: 60
          })
        : [];
    const mergedArtworksById = new Map<string, IndexedArtwork>();
    for (const artwork of artworks) mergedArtworksById.set(artwork.id, artwork);
    for (const artwork of forcedArtistArtworks) mergedArtworksById.set(artwork.id, artwork);
    const mergedArtworks = [...mergedArtworksById.values()];
    const weights = applyWeightBias(getScoreWeights(input.intentMode), input.tuning);
    const concreteWorksLift = input.characterization?.concreteWorksRequested ? -0.04 : 0;
    const artworkScoreFloor = getArtworkScoreFloor(input.intentMode, input.priorMisses) + (input.tuning?.artworkFloorDelta ?? 0) + concreteWorksLift;
    const artistScoreFloor = getArtistScoreFloor(input.intentMode, input.priorMisses) + (input.tuning?.artistFloorDelta ?? 0);
    const artworkLimit = input.artworkLimit ?? appConfig.retrieval.artworkLimit;
    const artistLimit = input.artistLimit ?? appConfig.retrieval.artistLimit;

    const rankedArtworks = mergedArtworks
      .filter((artwork) => artwork.imageUrl && !(input.excludeArtworkIds ?? []).includes(artwork.id))
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
        const visualScore = input.embedding.length ? cosineSimilarity(input.embedding, imageEmbedding) : 0;
        const derivedTags = dedupeStrings([...artworkTags.allTags, ...extractSemanticTags(searchableText).allTags]);
        const tagScore = scoreTagOverlap(effectiveQueryTags, derivedTags);
        const periodScore = scoreTagOverlap(semanticTags.allTags, periodTags.map((tag) => tag.toLowerCase()));
        const requestedArtistBoost = matchesRequestedArtist(artwork.artist?.name ?? null, forcedArtistNames) ? 0.14 : 0;
        const totalScore =
          weights.semantic * semanticScore +
          weights.lexical * lexical +
          weights.visual * visualScore +
          weights.tags * tagScore +
          weights.period * periodScore +
          requestedArtistBoost;
        const confidence = classifyConfidence(input.intentMode, totalScore, lexical, tagScore);

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
          styleTags: dedupeStrings([...artworkTags.styleTags, ...extractSemanticTags(searchableText).styleTags]),
          periodTags,
          tags: derivedTags,
          textScore: semanticScore,
          imageScore: visualScore,
          tagScore,
          preferenceScore: 0,
          lexicalScore: lexical,
          score: totalScore,
          explanation: buildArtworkExplanation({
            intent: input.intentMode,
            confidence,
            tags: artworkTags.allTags,
            periodTags,
            semanticScore,
            visualScore,
            tagScore
          }),
          evidenceSummary: `Indexed corpus match from ${getProvenanceLabel(artwork.externalSource, artwork.metadataJson)} with semantic, tag, and conversation overlap.`,
          confidenceLabel: confidence,
          uncertaintySummary: buildUncertaintySummary(input.intentMode, confidence),
          sourceKind: "indexed_corpus"
        };
      })
      .sort((a, b) => b.score - a.score)
      .filter((artwork, index) => (index === 0 ? artwork.score >= artworkScoreFloor - 0.04 : artwork.score >= artworkScoreFloor))
      .slice(0, artworkLimit);

    const rankedArtists = artists
      .filter((artist) => !(input.excludeArtistIds ?? []).includes(artist.id))
      .map((artist): ArtistCandidate => {
        const artistTags = extractSemanticTags(artist.name, artist.bio);
        const artistEmbedding = asEmbedding(artist.textEmbedding);
        const semanticScore = cosineSimilarity(blendedQueryEmbedding, artistEmbedding);
        const lexical = lexicalScore(queryText, `${artist.name} ${artist.bio ?? ""} ${artistTags.allTags.join(" ")}`);
        const tagScore = scoreTagOverlap(effectiveQueryTags, artistTags.allTags);
        const requestedArtistBoost = matchesRequestedArtist(artist.name, forcedArtistNames) ? 0.16 : 0;
        const relatedArtworkBoost = Math.min(artist.artworks.length / 10, 1) * 0.08;
        const score =
          (input.intentMode === "artist_context" || input.intentMode === "identification" ? 0.58 : 0.48) * semanticScore +
          0.16 * lexical +
          0.18 * tagScore +
          relatedArtworkBoost +
          requestedArtistBoost;
        const confidence = classifyConfidence(input.intentMode, score, lexical, tagScore);
        return {
          id: artist.id,
          name: artist.name,
          bio: artist.bio,
          provenanceLabel: "indexed artist corpus",
          relatedArtworkCount: artist.artworks.length,
          score,
          explanation: buildArtistExplanation(input.intentMode, confidence, tagScore, score),
          evidenceSummary: "Indexed artist corpus suggestion based on semantic proximity and nearby tagged works.",
          confidenceLabel: confidence,
          uncertaintySummary: buildUncertaintySummary(input.intentMode, confidence),
          sourceKind: "indexed_corpus"
        };
      })
      .sort((a, b) => b.score - a.score)
      .filter((artist, index) => (index === 0 ? artist.score >= artistScoreFloor - 0.04 : artist.score >= artistScoreFloor))
      .slice(0, artistLimit);

    const localEvidenceStrong =
      rankedArtworks[0]?.confidenceLabel === "identified_from_evidence" || (rankedArtworks[0]?.score ?? 0) >= 0.7;
    const supportedDirections = Array.from(
      new Set(
        rankedArtworks
          .flatMap((artwork) => [...artwork.styleTags, ...artwork.periodTags.map((tag) => tag.toLowerCase()), ...artwork.tags])
          .filter(Boolean)
      )
    ).slice(0, 8);
    const blockedDirection = effectiveQueryTags.find((tag) => !supportedDirections.includes(tag)) ?? null;

    return {
      artworks: rankedArtworks,
      artists: rankedArtists,
      matchReason: {
        localEvidenceStrong,
        supportedDirections,
        blockedDirection,
        summary: localEvidenceStrong
          ? "The indexed corpus returned a grounded direction for this turn."
          : "The indexed corpus returned only partial evidence for this turn."
      }
    };
  } catch (error) {
    throw new RetrievalError("Retrieval agent failed to rank candidates.", { cause: error });
  }
}
