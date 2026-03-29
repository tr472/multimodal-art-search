# Implementation Plan

## Phase 1: Repo scaffold
- initialize Next.js app
- configure Postgres
- configure storage
- add auth
- define schema and migrations
- create placeholder UI

## Phase 2: Corpus ingestion
- implement source adapters for open museum / collection data
- normalize into shared schema
- store provenance
- generate embeddings
- load into database

## Phase 3: Retrieval
- build artwork/artist search service
- support text query retrieval
- support image-adjacent retrieval from submission analysis
- support hybrid reranking

## Phase 4: Submission flow
- image upload
- note input
- multimodal analysis
- store submission + analysis
- retrieve related records
- generate commentary

## Phase 5: Personalization
- extract preference signals from user interactions
- maintain taste-profile summary + embedding
- rerank recommendations using user profile

## Phase 6: Homepage
- show prior submissions
- show saved/recommended artists and works
- show taste profile summary

## Phase 7: Demo polish
- seed dataset
- add sample users
- add explanation UI showing why items were recommended
