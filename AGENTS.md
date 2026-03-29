# AGENTS.md

## Project objective
Build a fast MVP for a multimodal art discovery and personalization system that demonstrates:
- large-scale heterogeneous data ingestion
- normalized art metadata schema
- semantic retrieval
- personalized recommendations
- lightweight production-style web app

## Working style
- Plan before making major architectural changes.
- Prefer simple, modular implementations.
- Do not overengineer.
- Use existing services and models instead of training custom models.
- Keep the app demoable at all times.

## Technical rules
- Frontend: Next.js + TypeScript
- Database: Postgres
- ORM: Prisma or Drizzle
- Styling: Tailwind
- Storage: S3-compatible
- Prefer server actions / clear API handlers
- Keep environment variables documented in `.env.example`

## Data / ML rules
- Use open or clearly permitted sources for MVP corpus
- Track provenance on all ingested records
- Keep normalization logic separate from app logic
- Store embeddings and make retrieval explainable
- Support text, image, and preference-aware reranking

## Build priorities
1. working schema
2. ingestion pipeline
3. retrieval
4. upload + chat flow
5. taste profile
6. homepage/dashboard

## Done criteria
A task is done only if:
- code builds
- types pass
- lint passes
- migrations run
- README/docs updated if behavior changed

## Avoid
- marketplace features
- social features
- unnecessary microservices
- custom model training
- brittle scraping-first architecture
