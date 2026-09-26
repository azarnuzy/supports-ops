# Operator Console

Operators are SupportOps staff, not Workspace users. Create and manage them only on the server.

Set `OPERATOR_AUTH_SECRET` in `env.production` to a different random value of at least 32 characters, then deploy the migration. For local development, add it to `.env.local`.

The normal deployment workflow applies the migration when it deploys the API. To apply it manually on the VPS, run `./deploy.sh COMMIT_SHA api` from `/srv/apps/supports-ops`.

For local development:

```sh
pnpm operator:create
pnpm operator:disable
pnpm operator:reset-password
```

On the VPS, the host only has Docker, not pnpm — run the script inside the `api` service's image instead, from `/srv/apps/supports-ops`:

```sh
docker compose --env-file env.production --env-file .release.env -f compose.prod.yaml run --rm api pnpm exec tsx scripts/operator-create.ts
docker compose --env-file env.production --env-file .release.env -f compose.prod.yaml run --rm api pnpm exec tsx scripts/operator-disable.ts
docker compose --env-file env.production --env-file .release.env -f compose.prod.yaml run --rm api pnpm exec tsx scripts/operator-reset-password.ts
```

Run each as a single line — a wrapped terminal that splits `pnpm` across two lines will paste back as separate `pnp` and `m` tokens and fail with `Cannot find module '/app/pnp'`.

This starts a one-off container from the already-built `api` image (which contains the full monorepo, pnpm, and tsx) on the same internal network as Postgres, so it picks up `DATABASE_URL` and `OPERATOR_AUTH_SECRET` from `env.production` automatically. Each command prompts for the Operator email. Creation and password reset also prompt twice for a password. Disabling immediately revokes every active Operator session.
