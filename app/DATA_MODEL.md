# Data Model

## Core entities

### User
- id
- email
- name
- created_at

### UserTasteProfile
- user_id
- summary_text
- preference_tags
- disliked_tags
- embedding
- updated_at

### Submission
- id
- user_id
- image_url
- raw_note
- transcript
- created_at

### SubmissionAnalysis
- submission_id
- model_summary
- detected_style
- detected_subjects
- palette_notes
- OCR_text
- embedding
- confidence

### Artwork
- id
- external_source
- external_id
- title
- artist_id
- institution_id
- date_text
- medium
- dimensions
- description
- image_url
- metadata_json
- text_embedding
- image_embedding
- source_url
- provenance_json

### Artist
- id
- name
- birth_year
- death_year
- nationality
- bio
- text_embedding

### Institution
- id
- name
- type
- city
- country
- website

### RecommendationEvent
- id
- user_id
- submission_id
- recommended_entity_type
- recommended_entity_id
- rank
- reason_text
- created_at

### ThreadArtworkMention
- id
- thread_id
- artwork_id
- created_at

### ThreadArtistMention
- id
- thread_id
- artist_id
- created_at

### UserFeedback
- id
- user_id
- target_entity_type
- target_entity_id
- signal_type
- signal_value
- note
- created_at
