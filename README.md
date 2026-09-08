# SupportOps

pnpm workspace with:

- `apps/api`: Hono API on Node.js.
- `apps/business-system`: separate, read-only Customer, Subscription, and Invoice HTTP service.
- `apps/platform`: React + Vite + TanStack Router file routes + TanStack Query.
- `apps/widget`: customer-facing Web Widget.
- `apps/worker`: Redis + BullMQ deployable.
- `packages/ai-agent`: AI Agent reasoning boundary.
- `packages/api-client`: typed Hono RPC client shared by the frontend apps.
- `packages/channels`: Channel Adapter boundary.
- `packages/knowledge`: Knowledge retrieval boundary.
- `packages/logger`: Pino logging and OpenTelemetry setup for server applications.
- `packages/shared`: schemas shared across application boundaries.
- `packages/storage`: S3-compatible object storage primitives.
- `packages/tools`: Business Tool boundary.
- `packages/ui`: shared shadcn components.

Packages are source-only: they export their `.ts`/`.tsx` files directly and do not have a build step.
Runtime-specific environment validation lives with the API and worker that consume it.

## Setup

```sh
pnpm install
cp .env.example .env
docker compose -f docker-compose.dev.yaml up -d
pnpm db:generate
pnpm db:migrate
```

## Development

```sh
pnpm --filter @repo/api dev
pnpm --filter @repo/business-system dev
pnpm --filter @repo/platform dev
pnpm --filter @repo/worker dev
```

## Tests

```sh
pnpm test
```

This runs the base Vitest suites for API, Platform, and Worker.

## Auth and API Client

The API uses Better Auth for email/password auth, session cookies, and admin roles. Better Auth is mounted at `/api/auth/*`; custom API routes use Hono RPC types through `packages/api-client`.

Frontend apps should use:

- Better Auth client methods for sign-in, sign-up, and sign-out.
- `createApiClient()` from `@repo/api-client` for typed API routes such as `/session` and `/users`.

Configure auth with `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `CLIENT_ORIGINS` in `.env`.
Use a unique `BETTER_AUTH_SECRET`; production environments reject the default value and secrets
shorter than 32 characters.

Create or promote an admin user:

```sh
pnpm createsuperuser
```

## Storage

`packages/storage` exports S3-compatible helpers for AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces, and similar providers.

```ts
import { createStorage } from "@repo/storage";

const storage = createStorage({
  accessKeyId: "access-key",
  bucket: "uploads",
  forcePathStyle: false,
  region: "ap-southeast-1",
  secretAccessKey: "secret-key",
});

await storage.putObject({
  key: "uploads/example.txt",
  body: "hello",
  contentType: "text/plain",
});
```

Configure it with `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and optional endpoint/path-style/public URL variables in `.env`.

## Logging

`packages/logger` exports Pino helpers for structured JSON logs.

```ts
import { createLogger } from "@repo/logger";
import { loggerConfig } from "./config";

const logger = createLogger({
  ...loggerConfig,
  service: "api",
});

logger.info({ userId: "user_123" }, "User signed in");
```

Trace-aware helpers use OpenTelemetry-compatible `trace_id`, `span_id`, and `trace_flags` fields. When telemetry is enabled, active span context is attached to Pino logs automatically.

## Telemetry

`packages/logger/telemetry` starts the OpenTelemetry Node SDK before API and worker modules load, so auto-instrumentation can patch supported Node libraries.

Telemetry is disabled by default. For local span output:

```sh
ENABLE_TELEMETRY=true
TELEMETRY_EXPORTER=console
```

For an OTLP HTTP collector:

```sh
ENABLE_TELEMETRY=true
TELEMETRY_EXPORTER=otlp
TELEMETRY_EXPORTER_OTLP_ENDPOINT="https://collector.example.com/v1/traces"
TELEMETRY_API_KEY="..."
TELEMETRY_API_KEY_HEADER="authorization"
```

If `TELEMETRY_API_KEY_HEADER` is `authorization`, the exporter sends `Authorization: Bearer <key>`. Other header names send the raw key value, which fits providers that expect headers such as `x-honeycomb-team`.

## AI Agent Evals

`packages/ai-agent/src/evals` runs Eval Cases against a fixed, in-memory corpus — never against a live Workspace — to judge whether a change to the AI Agent made things better or worse. Run by hand, not in CI (ADR-0010):

```sh
OPENROUTER_API_KEY=... pnpm eval:ai-agent
pnpm eval:ai-agent -- --category grounding
pnpm eval:ai-agent -- --category grounding --case password-reset-answered-from-source
```

Eight categories defend one requirement each: visibility safety, grounding, escalation that must happen, escalation that must not happen, tool calling, classification, resolution detection, and language. Every category includes a negative-control case that always fails, so a broken evaluator can't quietly mark everything as passing. Results print to the console and report through the OTel eval reporter alongside agent telemetry.

## Docker

```sh
cp .env.example .env
# Set BETTER_AUTH_SECRET in .env, for example:
openssl rand -base64 32
docker compose up --build
```

The production Compose file builds only the API application and its Postgres database. The API is available at `http://localhost:8000` by default; override `API_HOST_PORT` when another host port is required.

The API container runs Prisma migrations with `pnpm db:deploy` on startup. If you already created a local Compose database with the older `db:push` flow, reset the local volume or baseline the database before switching to migrations.

For local development, `docker-compose.dev.yaml` still provides Postgres and Redis while the API, worker, and frontends run directly through pnpm:

- API health: `http://localhost:8000/health`
- Postgres with `docker-compose.dev.yaml`: `localhost:15432`
- Redis with `docker-compose.dev.yaml`: `localhost:16379`
