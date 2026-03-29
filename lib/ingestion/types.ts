export type MuseumRecord = {
  objectID: number;
  title?: string;
  artistDisplayName?: string;
  artistDisplayBio?: string;
  objectDate?: string;
  medium?: string;
  dimensions?: string;
  primaryImage?: string;
  primaryImageSmall?: string;
  repository?: string;
  city?: string;
  country?: string;
  objectURL?: string;
  creditLine?: string;
  classification?: string;
  department?: string;
  culture?: string;
  period?: string;
  tags?: Array<{ term?: string }>;
  [key: string]: unknown;
};

export type NormalizedMuseumRecord = {
  externalSource: string;
  externalId: string;
  sourceUrl: string | null;
  rawPayload: Record<string, unknown>;
  artwork: {
    title: string;
    dateText: string | null;
    medium: string | null;
    dimensions: string | null;
    description: string | null;
    imageUrl: string | null;
    metadataJson: Record<string, unknown>;
    provenanceJson: Record<string, unknown>;
  };
  artist: null | {
    name: string;
    bio: string | null;
  };
  institution: null | {
    name: string;
    city: string | null;
    country: string | null;
    website: string | null;
    type: string | null;
  };
};

export type IngestionFilterConfig = {
  requireImage: boolean;
  requireTitle: boolean;
  requireArtistOrDescription: boolean;
};

export type IngestionOptions = {
  query: string;
  hasImages: boolean;
  maxRecords: number;
  batchSize: number;
  maxConcurrentRequests: number;
  interBatchDelayMs: number;
  maxRetries: number;
  retryDelayMs: number;
  startOffset: number;
  resetCursor: boolean;
  filter: IngestionFilterConfig;
};
