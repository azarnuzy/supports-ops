# Workspace isolation enforced by a Prisma client extension

Every query against a Workspace-scoped model is filtered by a Prisma client extension that injects the current Workspace from request context, rather than by each repository remembering to write the filter itself.

The requirement is absolute — a user in one Workspace must never reach another's data — and the failure mode of the manual approach is silent: a forgotten filter leaks data without breaking anything visible. With much of this codebase written by coding agents across many separate sessions, "remember to add the filter" is not an enforceable invariant.

Postgres row-level security would be stronger still, but it requires every pooled connection to set the tenant per transaction, which complicates connection reuse and makes debugging materially harder than it is worth for this build.

## Consequences

The extension is only as good as the request context feeding it, so tests must include deliberate cross-Workspace reads that are expected to return nothing.
