import type { RetrievalIntent } from "@/types/retrieval";

export type ResearchMode = "indexed_corpus" | "external_lookup";

export type MessageEvidence = {
  intent: RetrievalIntent;
  mode: ResearchMode;
  whyThese: string;
  uncertainty: string;
  sourceSummary: string;
  functionalitySummary: string;
  confidence: "identified_from_evidence" | "inferred_by_resemblance" | "uncertain";
};

export type WorkspaceMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  attachment?: {
    imageUrl: string;
    role: WorkspaceImage["role"];
    note: string | null;
  } | null;
  evidence?: MessageEvidence | null;
  artworks?: ArtworkRecommendation[];
  artists?: ArtistRecommendation[];
};

export type WorkspaceImage = {
  id: string;
  imageUrl: string;
  role: "PRIMARY" | "SUPPORTING" | "DETAIL" | "WALL_LABEL" | "COMPARATIVE";
  note: string | null;
};

export type ArtworkRecommendation = {
  id: string;
  title: string;
  artistName: string | null;
  reason: string;
  imageUrl: string | null;
  dateText?: string | null;
  provenanceLabel?: string | null;
  sourceInstitution: string | null;
  sourceUrl: string | null;
  sourceKind: "indexed_corpus" | "external_lookup";
  evidenceSummary: string;
  uncertainty: string;
};

export type ArtistRecommendation = {
  id: string;
  name: string;
  bio: string | null;
  reason: string;
  provenanceLabel?: string | null;
  sourceKind: "indexed_corpus";
  evidenceSummary: string;
  uncertainty: string;
};

export type ExternalLookupCard = {
  id: string;
  mode: "IDENTIFICATION" | "CONTEXT" | "RECOMMENDATION";
  candidateTitle: string | null;
  candidateArtist: string | null;
  movementOrPeriod: string | null;
  evidenceSummary: string;
  sourceUrls: string[];
  confidence: number;
  sourceLabel: string;
};

export type SavedChatPreview = {
  threadId: string;
  submissionId: string;
  title: string;
  summaryText: string;
  updatedAt: string;
  artworks: Pick<ArtworkRecommendation, "id" | "title" | "imageUrl">[];
};

export type ThreadStatusBanner = {
  label: string;
  detail: string;
  tone: "neutral" | "info" | "success" | "warning";
};

export type ThreadWorkspace = {
  threadId: string;
  submissionId: string;
  threadTitle: string;
  isSaved: boolean;
  submissionNote: string;
  submissionSummary: string;
  statusBanner?: ThreadStatusBanner | null;
  messages: WorkspaceMessage[];
  images: WorkspaceImage[];
  artworks: ArtworkRecommendation[];
  artists: ArtistRecommendation[];
  galleryArtworks: ArtworkRecommendation[];
  externalLookups: ExternalLookupCard[];
  savedChats: SavedChatPreview[];
};
