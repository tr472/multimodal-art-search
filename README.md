# Art Search MVP

A lightweight conversational art companion for multimodal art understanding, indexed semantic retrieval, adaptive recommendation, and targeted web-backed context lookup. The repository includes a reproducible demo dataset and ingestion pipeline.

The included dataset is a curated subset; the system is designed to scale to larger external museum collections via the ingestion scripts.


## What This Is

This project is a niche product demo for people who want help looking closely at artworks, not just finding “similar images.”

You can:

- **external cultural data ingestion** (The Met Collection API)
- **normalization** into a shared schema (`Artwork`, `Artist`, `Institution`)
- **grounded indexed retrieval** with explanations and provenance fields
- **simple personalization** via a persistent taste profile

In practice, the flow is:

1. Upload an artwork image.
2. Add a note about what you are noticing or what you want to understand.
3. Get a grounded first reading plus related works and artists from the indexed corpus.
4. Keep chatting to refine the direction.
5. Save the thread, gallery, and provenance-backed reasoning trail.

This is useful as both:

- a user-facing demo of a conversational art-discovery experience
- a technical MVP showing ingestion, normalization, embeddings, retrieval, and thread persistence

## System Overview

```mermaid
flowchart TD
    A[External Museum Data] --> B[Normalize Corpus]
    B --> C[Postgres + Prisma]
    C --> C1[Artwork / Artist / Institution]
    C --> C2[Provenance]
    C --> C3[Stored embeddings + pgvector]

    D[User uploads artwork image + note] --> E[Multimodal Analysis]
    E --> E1[Visual description]
    E --> E2[Semantic query text]
    E --> E3[Submission embedding]

    E --> F[Retrieval + Reranking]
    C --> F
    F --> F1[Vector candidate search]
    F --> F2[Visual + semantic + lexical scoring]
    F --> F3[Preference-aware reranking]
    F --> F4[Confidence / uncertainty labeling]

    F --> G[Conversational Response]
    G --> G1[Grounded recommendations]
    G --> G2[Evidence + provenance]
    G --> G3[Saved thread + gallery]
```

In short:

1. Museum records are ingested and normalized into a shared schema.
2. The corpus stores metadata, provenance, and embeddings.
3. A user upload is analyzed into visual and semantic signals.
4. Retrieval pulls candidates from the indexed corpus and reranks them.
5. The app returns a grounded conversational response and preserves the thread.

---

## Architecture at a glance

### 1) Live external ingestion path
- `scripts/ingest-museum.ts` fetches Met object IDs + records.
- Uses retry, bounded concurrency, and inter-batch delay for API-safe ingest.
- Stores resumable cursor + raw NDJSON cache for reproducibility.

### 2) Normalized database path
- `lib/ingestion/normalize/metMuseum.ts` maps source payloads to internal shape.
- `lib/ingestion/pipeline/upsertNormalized.ts` deduplicates/upserts by source keys.
- Provenance is preserved (`externalSource`, `externalId`, `sourceUrl`, raw payload subset).
- Each artwork record stores semantic tags, source metadata, and embeddings so the runtime retrieval layer can search a broader indexed corpus than the small visible card set.

### 3) Local reproducible demo path
- `ingestion/data/met-demo-subset.normalized.json` is a checked-in small corpus.
- `npm run db:seed` safely upserts this subset into the local corpus and preserves any already-expanded corpus records plus existing conversations by default.
- `npm run db:seed:reset` resets demo conversation/taste state while preserving already-ingested corpus expansion.
- `npm run db:seed:prune` is the explicit destructive option that prunes the corpus back down to the seed subset and resets demo state.

See also: `docs/INGESTION_ARCHITECTURE_NOTE.md`.

---

## Quick Start (Recommended - Hosted Database / Neon)

1. Create a free Postgres database.

Neon is the recommended option for this repo because it works well with the `pgvector` migration and makes it easy to spin up separate review branches.

2. Copy your connection string and set it in `.env`:

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require"
```

3. Add your OpenAI API key in `.env` (required for the conversational submission agent and real text embeddings):

```
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
OPENAI_ANALYSIS_MODEL="gpt-4.1-mini"
OPENAI_VISUAL_MODEL="gpt-4.1-mini"
PGVECTOR_EMBEDDING_DIM="1536"
MAX_UPLOAD_SIZE_MB="12"
NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB="12"
```

You can create/manage API keys at: https://platform.openai.com/api-keys

4. Install dependencies:

```
npm install
```

5. Run demo setup:

```
npm run demo:setup
```

If you are using Neon for a shared or reviewer-facing database, prefer the deploy-style migration flow instead of `prisma migrate dev`:

```
npm run db:generate
npm run db:migrate:deploy
npm run db:seed:reset
```

For local development against Neon, the most reliable setup is often to use the direct Neon branch URL for both `DATABASE_URL` and `DIRECT_URL`. The pooled `-pooler` URL can be useful in deployment, but Prisma Client and local seed scripts may work more reliably against the direct connection during setup.

6. Start the app:

```
npm run dev
```


Open:

* `/` — app entry point and recent discussion history
* `/submit` — upload an image, get the first reply inline, add more images in-thread, and save or reopen chats later
* `/admin/provenance` — optional admin/debug source view

## Neon Setup For Shared Demos

Use this flow if you want one stable hosted database for your own demo and separate branches for collaborators, evaluators, or different demo states.

1. Create a Neon project.
2. For local setup, copy the direct branch connection string from Neon with connection pooling turned off.
3. Set both `DATABASE_URL` and `DIRECT_URL` to that direct URL in `.env`.
3. Run:

```
npm install
npm run db:generate
npm run db:migrate:deploy
npm run db:seed:reset
npm run dev
```

4. After the app is working locally, you can optionally switch `DATABASE_URL` to the pooled `-pooler` URL for deployment/runtime traffic if that connection is stable in your environment.
5. For a second demo environment, create a separate Neon branch such as `reviewer-demo`.
6. Get that branch's connection string and either:
   - point your deployed app at that branch, or
   - give someone that branch-specific `DATABASE_URL` for local setup.

This keeps other demo sessions from modifying your main conversations, recommendations, and taste-profile state.

## Local Development (Optional)

If you prefer to run Postgres locally:

1. Ensure Postgres is running

2. Create a database:

```
createdb multimodal_art_demo
```

3. Set `.env`:

```
DATABASE_URL="postgresql://YOUR_USERNAME@localhost:5432/multimodal_art_demo"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
OPENAI_ANALYSIS_MODEL="gpt-4.1-mini"
OPENAI_VISUAL_MODEL="gpt-4.1-mini"
PGVECTOR_EMBEDDING_DIM="1536"
MAX_UPLOAD_SIZE_MB="12"
NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB="12"
```

4. Run:

```
npm install
npm run demo:setup
npm run dev
```

If your local Postgres does not have the `vector` extension available, the app can still run using JSON-stored embeddings and app-level scoring, but you will not get the fast `pgvector` candidate search path.


---

## First Walkthrough

After `npm run demo:setup`, you can immediately:

1. Open `/submit` and upload an artwork image with a short note.
2. Verify that the first response appears inline with the conversation rather than sending you to a different page.
3. Add a follow-up message or a second image role such as detail, wall label, or comparative image.
4. Save, rename, or discard the chat and reopen saved threads from the same workspace.
5. Expand the evidence panels to inspect source details, thread-level discussed works, and optional targeted web-backed context.

---

## Commands

- `npm run demo:setup` — generate Prisma client, run migration, and seed the retrieval corpus while resetting demo conversation/taste state
- `npm run db:migrate:deploy` — apply committed Prisma migrations to a shared or hosted database such as Neon
- `npm run ingest:met -- --query=painting --max-records=300 --batch-size=20` — live Met ingest
- `npm run subset:create -- --count=60` — build deterministic subset into `ingestion/data/met-demo-subset.normalized.json`
- `npm run db:seed` — safely seed checked-in demo subset and preserve existing expanded corpus plus conversations (or pass custom subset path: `npm run db:seed -- path/to/custom-subset.normalized.json`)
- `npm run db:seed:reset` — reseed and clear conversation/taste state while preserving expanded corpus
- `npm run db:seed:prune` — destructive reset back to only the seeded subset

---

## Technical Details Worth Demonstrating

If you are showing the project to someone else, these are the implementation details that matter most:

- The corpus is ingested from external museum data, normalized into shared `Artwork`, `Artist`, and `Institution` records, and stored with provenance.
- Retrieval is not just lexical search: the app stores text embeddings, visual descriptor embeddings, and optional `pgvector` columns for faster candidate search.
- Uploads are analyzed into a semantic summary and a visual descriptor, then used to retrieve related artworks and artists.
- The thread model preserves messages, attached images, surfaced artworks, surfaced artists, and external context lookups separately, which makes the conversation inspectable later.
- Saved threads are distinct from the broader indexed corpus. The saved gallery reflects what remained relevant in the conversation, not everything that was ever indexed.
- External lookup is kept separate from trusted ingested records, so enrichment does not overwrite canonical source provenance.

Key files:

- [prisma/schema.prisma](/Users/tanvirao/multimodal-art-retrieval-demo/prisma/schema.prisma)
- [lib/ingestion/pipeline/upsertNormalized.ts](/Users/tanvirao/multimodal-art-retrieval-demo/lib/ingestion/pipeline/upsertNormalized.ts)
- [lib/analysis.ts](/Users/tanvirao/multimodal-art-retrieval-demo/lib/analysis.ts)
- [lib/visualEmbeddings.ts](/Users/tanvirao/multimodal-art-retrieval-demo/lib/visualEmbeddings.ts)
- [lib/retrieval.ts](/Users/tanvirao/multimodal-art-retrieval-demo/lib/retrieval.ts)
- [lib/pgvector.ts](/Users/tanvirao/multimodal-art-retrieval-demo/lib/pgvector.ts)
- [lib/threadWorkspace.ts](/Users/tanvirao/multimodal-art-retrieval-demo/lib/threadWorkspace.ts)

## Notes / scope

- Runtime retrieval searches the broader indexed corpus in `Artwork`/`Artist`, then bounds the visible turn results to a small demo-friendly set of cards.
- On the first visual turn for an upload, and on later image-attachment turns, the app can perform one bounded corpus expansion if the initial indexed match is weak, then rerank locally from the enlarged corpus.
- The thread workspace keeps a separate discussed gallery of artworks and artists that have surfaced during the conversation, rather than reusing the whole indexed corpus.
- Text embeddings use the OpenAI embeddings API when `OPENAI_API_KEY` is configured, with deterministic fallback only as a local/offline backup.
- Submission analysis can optionally use a multimodal OpenAI model via `OPENAI_ANALYSIS_MODEL`, with heuristic fallback when keys are missing.
- Corpus artworks and uploaded images can now be converted into model-backed visual descriptors, then embedded for stronger image-led retrieval. After this change, reseeding or re-ingesting refreshes those stored image embeddings.
- When the `pgvector` migration is applied and embeddings are OpenAI-sized vectors, retrieval can use fast vector candidate search in Postgres before the app-level reranker runs.
- External web lookup results are stored separately from trusted ingested corpus records, so enrichment does not overwrite canonical provenance.
- This repo intentionally avoids marketplace/social features and custom model training.
- Included dataset is small for speed; architecture is designed for larger external corpora.
