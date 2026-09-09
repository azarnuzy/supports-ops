# Knowledge Sources auto-publish with visible ingestion

Every new or edited Knowledge Source is processed immediately and becomes Published when extraction, chunking, embedding, and indexing succeed; Admins do not perform a separate publish step. The latest ingestion stage is persisted and streamed over the existing Workspace SSE channel so the UI can show real progress and stage-specific failures without inventing percentages.

During an update, the previously Published Chunks remain retrievable until replacement Chunks are ready, then content and Chunks are replaced atomically. This keeps the AI Agent available while an Admin edits content or refreshes a PDF or website, while a failed update can truthfully report that the previous version remains active. Extracted PDF and website content becomes the editable canonical content of each Knowledge Source; refreshing from the original source may replace those edits only after explicit confirmation.
