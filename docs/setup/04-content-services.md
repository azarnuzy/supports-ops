# Content services

Knowledge ingestion uses hosted services so the API and worker do not run OCR or a headless browser locally.

Set both values in `.env.local` for development and in `.env` for root Docker Compose production:

```dotenv
MISTRAL_API_KEY="..."
TAVILY_API_KEY="..."
```

Chat attachments use `OPENROUTER_API_KEY` directly: documents and images default to `google/gemini-3.1-flash-lite`, and voice notes to `openai/whisper-large-v3-turbo`. Override these with `ATTACHMENT_FALLBACK_MODEL` and `AUDIO_FALLBACK_MODEL`. Knowledge Source PDFs continue to use Mistral OCR first, with OpenRouter as a fallback after a 429, 5xx, or network failure. Tavily is used for documentation ingestion.

DOCX and PPTX attachments are read locally from their Office XML text first. Documents with embedded media or charts are also sent to document extraction so visual content is available. Unsupported WhatsApp documents remain downloadable for a Human Agent.

Documentation crawls are deliberately fixed at same-origin, depth one, and 25 pages. Those limits are enforced in worker code, not exposed as Workspace settings. A source that fails keeps its readable provider error and can be published again to retry; other pages from the same crawl remain available as separate Knowledge Sources.

Files are stored using the existing S3-compatible configuration (`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and optional endpoint settings). The worker creates a short-lived signed download URL when requesting document extraction, so the bucket does not need to be public.
