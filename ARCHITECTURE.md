# Architecture

## Recommended stack
- Frontend: Next.js
- Backend/API: Next.js API routes or FastAPI
- Database: Postgres
- Object storage: S3-compatible bucket
- Vector store: pgvector or dedicated vector DB
- Search: Postgres hybrid search initially
- AI: multimodal LLM + text/image embeddings

## System layers

### 1. Ingestion layer
- connectors for museum APIs / open datasets / approved public sources
- ETL jobs to normalize records into shared schema
- embedding generation jobs
- provenance tracking for every source record

### 2. Application layer
- auth
- upload flow
- chat endpoint
- user profile endpoint
- recommendations endpoint
- homepage/dashboard

### 3. Intelligence layer
- multimodal artwork interpretation
- retrieval over artworks/artists/institutions
- preference extraction from user interactions
- personalized reranking based on taste profile

## Design principles
- optimize for fast MVP delivery
- use existing models and tools
- keep ingestion and app layers decoupled
- make every recommendation traceable to source records
