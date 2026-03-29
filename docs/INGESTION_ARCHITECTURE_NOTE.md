# Ingestion Architecture Note (Fellowship Demo)

## 1) Live external ingestion path

- The Met adapter fetches object IDs via search, then pulls object details in rate-limit-safe batches.
- Ingestion is resumable through a persisted cursor (`data/raw/met/cursor.json`).
- Raw source records are cached in NDJSON (`data/raw/met/records.ndjson`) for reproducibility and debugging.

## 2) Normalized database path

- Filtered records are normalized into internal schema-aligned objects.
- Upsert pipeline deduplicates artworks by `(externalSource, externalId)`.
- Artist and institution records are upserted safely and linked to artworks.
- Provenance is stored for each artwork, including source name, external ID, and source URL.

## 3) Local reproducible demo path

- `ingestion/data/met-demo-subset.normalized.json` is a small checked-in subset.
- This subset can be seeded quickly without live API calls.
- Optional script builds a fresh subset from cached live ingest output for repeatable local demos.
