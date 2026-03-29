# Product Requirements Document

## Product summary
Build an MVP for an agentic AI art companion that helps users understand, remember, and discover art through multimodal interaction.

## Core user stories
1. As a user, I can upload a photo of an artwork and add an optional note.
2. As a user, I receive useful commentary about the artwork, its likely style, themes, and related artists/works.
3. As a user, I get recommendations that reflect both the submitted artwork and my prior taste profile.
4. As a user, I can revisit prior uploads, saved artists, and recommended works on a homepage.
5. As a reviewer, I can see that the system operates on a meaningful corpus and uses retrieval + personalization rather than only generic chatbot output.

## MVP scope
### In scope
- authentication
- image upload
- note/text input
- chat response per artwork submission
- retrieval from a normalized art corpus
- basic taste-profile persistence
- homepage/dashboard with history and recommendations

### Out of scope
- marketplace
- social graph
- institution self-serve pages
- custom ML training
- exhaustive scraping of the web

## Success criteria
- user can submit image + note and receive grounded commentary
- system retrieves related works/artists from corpus
- recommendations visibly improve with repeated interactions
- architecture clearly demonstrates large-dataset ingestion and retrieval
