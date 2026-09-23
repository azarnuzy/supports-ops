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

On the VPS, replace `pnpm operator:<command>` with `pnpm with-production-env tsx scripts/operator-<command>.ts`. Each command prompts for the Operator email. Creation and password reset also prompt twice for a password. Disabling immediately revokes every active Operator session.
