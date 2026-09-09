# Object storage

Attachments and PDF Knowledge Sources are stored in an S3-compatible bucket.
The API validates attachment size and type before writing objects; browsers do
not upload to the bucket directly.

1. Create a private bucket named `supportops` (or choose a different name).
2. Create credentials limited to read, write, and delete objects in that bucket.
3. Set `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and
   `S3_SECRET_ACCESS_KEY` in `.env.local` for development or `.env` for root Docker Compose production. Set `S3_ENDPOINT` and
   `S3_FORCE_PATH_STYLE=true` for MinIO or another local S3-compatible service.
4. Set the same values for both API and Worker processes. The worker uses
   short-lived signed GET URLs for OCR; the bucket must remain private.
5. Set a shared, random `INTERNAL_WORKER_TOKEN`. The worker also needs
   `API_INTERNAL_URL` (normally `http://localhost:8000`) to start the AI reply
   only after attachment extraction finishes.

The Widget accepts PDF, plain-text, JPEG, and PNG files up to 10 MB. Permanent
object URLs are never stored; attachment access is always intended to use a
fresh signed URL at the serving boundary.
