# Operator Console as a separate app with its own Operator identity

SupportOps staff oversee every Workspace from `apps/console`, served on its own subdomain, and sign in as an Operator: an identity with its own table, sessions, and cookie that belongs to no Workspace. Operators have email-and-password sign-in, no sign-up endpoint, and are created, disabled, and reset only by a CLI run on the server. The Console talks to the same `apps/api`, whose `/operator/*` routes sit behind their own guard and are the only routes allowed to read across Workspaces.

This reverses the spirit of ADR-0001, which deleted `apps/admin` because Admins and Human Agents share the same screens. Operators share none: every Console screen is cross-Workspace and none of the Inbox or Ticket UI is reused.

## Considered Options

- **A route group inside `apps/platform`.** Rejected: the cross-Workspace code and its routes would ship in the bundle every Customer's Admin downloads, and a stolen platform session would reach the Console on the same origin.
- **An `OPERATOR` Role, or an email allowlist, on an ordinary Workspace user.** Rejected: cross-tenant access would ride on a tenant account, so compromising one Admin of the operator's own Workspace compromises every Workspace. It also forces an Operator to belong to a Workspace, which the domain says it does not.
- **A separate backend as well.** Rejected: the credits, analytics, and AI Usage services already exist and only need an explicit Workspace instead of the request's; a second backend would duplicate them.

## Consequences

- `/operator/*` is the one place `unscopedPrisma` is used from a request, so every route there must reject a Workspace user's session, and tests must prove it.
- Two-factor sign-in was deliberately left out; the Operator's password is the only factor, so it is set only through the CLI and Operator sessions are short.
- Operators never read Message content; the Console shows Workspace totals only.
