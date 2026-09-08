# Content services

Knowledge ingestion uses hosted services so the API and worker do not run OCR or a headless browser locally.

Set both values in `.env` for development and in the production environment:

```dotenv
MISTRAL_API_KEY="..."
TAVILY_API_KEY="..."
```

Create the first key in the Mistral console. It is used only by the worker to send stored PDFs to `mistral-ocr-latest`; this also reads scanned PDFs without a text layer. Create the second key in Tavily. It is used only by the worker for documentation ingestion.

Documentation crawls are deliberately fixed at same-origin, depth one, and 25 pages. Those limits are enforced in worker code, not exposed as Workspace settings. A source that fails keeps its readable provider error and can be published again to retry; other pages from the same crawl remain available as separate Knowledge Sources.

PDF files are stored using the existing S3-compatible configuration (`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and optional endpoint settings). The worker creates a short-lived signed download URL when requesting OCR, so the bucket does not need to be public.
