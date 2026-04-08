import { normalizeImageUrl } from "@/lib/ingestion/imageValidation";
import type { MuseumRecord, NormalizedMuseumRecord } from "@/lib/ingestion/types";
import { buildArtworkSemanticText, extractSemanticTags } from "@/lib/semanticTags";

function takeRawSubset(record: MuseumRecord): Record<string, unknown> {
  return {
    objectID: record.objectID,
    title: record.title,
    artistDisplayName: record.artistDisplayName,
    artistDisplayBio: record.artistDisplayBio,
    objectDate: record.objectDate,
    medium: record.medium,
    dimensions: record.dimensions,
    primaryImage: record.primaryImage,
    primaryImageSmall: record.primaryImageSmall,
    objectURL: record.objectURL,
    repository: record.repository,
    creditLine: record.creditLine,
    classification: record.classification,
    department: record.department,
    culture: record.culture,
    period: record.period,
    tags: record.tags
  };
}

export function normalizeMetMuseumRecord(record: MuseumRecord): NormalizedMuseumRecord {
  const title = record.title?.trim() || `Untitled (${record.objectID})`;
  const artistName = record.artistDisplayName?.trim() || null;
  const imageUrl = normalizeImageUrl(record.primaryImageSmall || record.primaryImage || "");
  const sourceUrl = record.objectURL?.trim() || null;
  const sourceTags = (record.tags ?? []).map((tag) => tag.term?.trim()).filter((tag): tag is string => Boolean(tag));

  const descriptionParts = [record.classification, record.department, record.culture, record.period]
    .filter(Boolean)
    .map((s) => String(s).trim());

  const description = descriptionParts.length > 0 ? descriptionParts.join(" · ") : null;
  const semanticTags = extractSemanticTags(
    title,
    artistName,
    record.medium,
    description,
    record.department,
    record.classification,
    record.culture,
    record.period,
    sourceTags.join(" ")
  );
  const semanticText = buildArtworkSemanticText({
    title,
    artistName,
    description,
    medium: record.medium?.trim() || null,
    dateText: record.objectDate?.trim() || null,
    sourceTags,
    semanticTags
  });

  return {
    externalSource: "met_museum_api",
    externalId: String(record.objectID),
    sourceUrl,
    rawPayload: takeRawSubset(record),
    artwork: {
      title,
      dateText: record.objectDate?.trim() || null,
      medium: record.medium?.trim() || null,
      dimensions: record.dimensions?.trim() || null,
      description,
      imageUrl,
      metadataJson: {
        department: record.department,
        classification: record.classification,
        culture: record.culture,
        period: record.period,
        sourceTags,
        semanticTags,
        creditLine: record.creditLine,
        // Earlier versions baked deterministic text embeddings directly into normalized records.
        // We now persist semantic text/tags here and generate real embeddings during database upsert.
        semanticText
      },
      provenanceJson: {
        source: "met_museum_api",
        sourceRecordId: record.objectID,
        sourceUrl,
        normalizedAt: new Date().toISOString()
      }
    },
    artist: artistName
      ? {
          name: artistName,
          bio: record.artistDisplayBio?.trim() || null
        }
      : null,
    institution: {
      name: record.repository?.trim() || "The Metropolitan Museum of Art",
      city: record.city?.trim() || "New York",
      country: record.country?.trim() || "USA",
      website: "https://www.metmuseum.org",
      type: "museum"
    }
  };
}
