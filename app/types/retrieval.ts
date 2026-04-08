export type Embedding = number[];

export type RetrievalIntent =
  | "identification"
  | "artist_context"
  | "historical_placement"
  | "recommendation"
  | "taste_exploration";

export type EvidenceConfidence = "identified_from_evidence" | "inferred_by_resemblance" | "uncertain";

export type RetrievalSourceKind = "indexed_corpus";

export type ArtworkCandidate = {
  id: string;
  title: string;
  description: string | null;
  artistName: string | null;
  institutionName: string | null;
  externalSource: string;
  provenanceLabel: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  dateText: string | null;
  styleTags: string[];
  periodTags: string[];
  tags: string[];
  textScore: number;
  imageScore: number;
  tagScore: number;
  preferenceScore: number;
  lexicalScore: number;
  score: number;
  explanation: string;
  evidenceSummary: string;
  confidenceLabel: EvidenceConfidence;
  uncertaintySummary: string;
  sourceKind: RetrievalSourceKind;
};

export type ArtistCandidate = {
  id: string;
  name: string;
  bio: string | null;
  provenanceLabel: string;
  relatedArtworkCount: number;
  score: number;
  explanation: string;
  evidenceSummary: string;
  confidenceLabel: EvidenceConfidence;
  uncertaintySummary: string;
  sourceKind: RetrievalSourceKind;
};

export type RetrievalEvidence = {
  localEvidenceStrong: boolean;
  shouldUseExternalLookup: boolean;
  supportedDirections: string[];
  blockedDirection: string | null;
  summary: string;
};

export type TurnRetrievalContext = {
  intent: RetrievalIntent;
  queryText: string;
  evidence: RetrievalEvidence;
  artworks: ArtworkCandidate[];
  artists: ArtistCandidate[];
};

export type RetrievalResult = TurnRetrievalContext;

export type AnalysisResult = {
  summary: string;
  style: string | null;
  subjects: string[];
  paletteNotes: string | null;
  ocrText?: string | null;
  confidence: number;
  embedding: Embedding;
};
