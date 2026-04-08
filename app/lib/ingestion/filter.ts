import { isLikelyValidImageUrl } from "@/lib/ingestion/imageValidation";
import type { IngestionFilterConfig, MuseumRecord } from "@/lib/ingestion/types";

export function passesMuseumFilter(record: MuseumRecord, filter: IngestionFilterConfig): boolean {
  const title = (record.title ?? "").trim();
  const artist = (record.artistDisplayName ?? "").trim();
  const description = [record.medium, record.classification, record.department].filter(Boolean).join(" ").trim();
  const imageUrl = (record.primaryImageSmall || record.primaryImage || "").trim();

  if (filter.requireImage && !isLikelyValidImageUrl(imageUrl)) return false;
  if (filter.requireTitle && !title) return false;
  if (filter.requireArtistOrDescription && !artist && !description) return false;

  return true;
}
