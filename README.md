# Monorepo Template

pnpm workspace with:

- `apps/api`: Hono API on Node.js.
- `apps/platform`: React + Vite + TanStack Router file routes + TanStack Query.
- `apps/admin`: React + Vite + TanStack Router file routes + TanStack Query.
- `packages/api-client`: typed Hono RPC client shared by the frontend apps.
- `packages/logger`: Pino logging and OpenTelemetry setup for server applications.
- `packages/storage`: S3-compatible object storage primitives.
- `packages/ui`: shared shadcn components and frontend i18next setup.
- `packages/worker`: Redis + BullMQ worker primitives.

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
pnpm --filter @repo/platform dev
pnpm --filter @repo/admin dev
pnpm --filter @repo/worker dev
```

## Tests

```sh
pnpm test
```

This runs the base Vitest suites for API, Platform, Admin, and Worker.

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

## Docker

```sh
cp .env.example .env
# Set BETTER_AUTH_SECRET in .env, for example:
openssl rand -base64 32
docker compose up --build
```

This full-stack Compose file starts Caddy, Postgres, Redis, API, and Worker. Caddy serves the built Platform and Admin frontend assets, reverse proxies the API, and is the only public service. API, Postgres, Redis, and Worker stay internal to the Compose network. The Docker services still use the single root `.env`; `DOCKER_DATABASE_URL` and `DOCKER_REDIS_URL` point containers at the Compose service names.

The API container runs Prisma migrations with `pnpm db:deploy` on startup. If you already created a local Compose database with the older `db:push` flow, reset the local volume or baseline the database before switching to migrations.

The default local URLs are:

- Platform: `http://localhost`
- Admin: `http://admin.localhost`
- API health: `http://api.localhost/health`
- Postgres with `docker-compose.dev.yaml`: `localhost:15432`
- Redis with `docker-compose.dev.yaml`: `localhost:16379`

For production, set the public addresses before building so the frontend bundle and auth settings point at the proxied API:

```env
PLATFORM_SITE_ADDRESS="app.example.com"
ADMIN_SITE_ADDRESS="admin.example.com"
API_SITE_ADDRESS="api.example.com"
VITE_API_URL="https://api.example.com"
BETTER_AUTH_URL="https://api.example.com"
CLIENT_ORIGINS="https://app.example.com,https://admin.example.com"
```
