# File and folder conventions

How `apps/platform`, `apps/api` and `packages/*` are organized internally.
This is about naming and file layout inside an app or package — not
app/package topology, which is fixed by
[ADR 0001](./adr/0001-monorepo-app-and-package-topology.md).

## `apps/platform` (frontend)

Domain code lives under `src/features/<name>/`, one directory per feature:

```
features/<name>/
  <name>.hooks.ts       # React Query hooks, mutations
  <name>.services.ts    # fetch calls, wraps @repo/api-client
  <name>.types.ts       # local types
  <name>.guards.ts       # route beforeLoad guards
  index.ts              # public barrel — only this is imported from outside
  components/<comp>/    # reusable pieces used by >1 view, kebab-case folder
    index.tsx
  views/<view>/          # one full page/screen
    <view>.tsx           # default export, named `<Name>View`
    <view>.types.ts       # only if the view has local form/UI state worth naming
```

Only add the files a feature actually needs — `auth` has all of the above,
`gallery` is just a `views/gallery/gallery.tsx`. Don't create empty
`hooks.ts`/`services.ts` files in anticipation of future use.

A `routes/*.tsx` file (TanStack Router) is a thin wrapper: `head`,
`beforeLoad`, and `component` pointing at a feature's view. Route-level auth
checks reuse the guards from `features/auth` (`requireAuth`, `requireAdmin`)
rather than duplicating the redirect logic inline.

Cross-cutting frontend concerns live in `src/lib/`:
- `query-client.ts` — the single `QueryClient` instance
- `query-keys.ts` — every React Query key, so a query and its invalidations
  can't drift apart
- `utils.ts` — small pure helpers shared by more than one feature
- `seo.ts` — page metadata helper

We don't have a `lib/http/*` layer: `@repo/api-client` already owns fetch
wrapping and typed API errors, so an app-local HTTP layer would just
duplicate it.

## `apps/api` (backend)

Domain code lives under `src/modules/<domain>/`, per ADR 0001. Inside a
module, use whichever of these apply — most modules need all four:

```
modules/<domain>/
  router.ts     # Hono sub-app, wires validation + services to HTTP
  schema.ts     # zod input schemas + inferred input types
  services.ts   # business logic, Prisma calls
  types.ts      # domain/response types not derived from schema.ts
```

A module wrapping a third-party integration (like `auth`, which wraps
better-auth) won't fit this shape exactly — it doesn't have request
validation to put in `schema.ts`. That's fine; keep `types.ts` for shared
variable/context types and split any middleware/guards into their own files
(`middleware.ts`, `guards.ts`) rather than piling unrelated exports into one
file.

Cross-module code (Prisma client, Workspace-isolation helpers) stays in
`src/utils/` — it's app-wide infrastructure, not a domain.

We do not add a controller/service/repository split beyond this: modules are
still small, and another layer of indirection wouldn't isolate anything that
`router.ts` / `services.ts` doesn't already separate.

## `packages/*` (shared libraries)

Every package has the same shape:

```
packages/<name>/
  package.json        # name `@repo/<name>`, private, type: module
  tsconfig.json       # extends ../../tsconfig.base.json, include ["src"]
  src/
    index.ts          # public barrel — re-exports only, no logic
    <concept>.ts      # one file per concept, kebab-case
    <concept>.test.ts # colocated test for that file
    types.ts          # only for types shared by several files in the package
    <group>/          # subfolder only once ≥3 files share one concern
```

**`index.ts` is only re-exports.** No functions, constants or types are
declared in it — implementation lives in a named file, even when the package
has only one (`storage/src/s3.ts`, `logger/src/logger.ts`,
`tools/src/business-tools.ts`, `test-db/src/database.ts`). Opening `index.ts`
should show a package's whole public surface at a glance.

- Use `export * from "./<file>"` when every export of that file is public
  (`api-client`, `channels`, single-file packages).
- Use named re-exports when a file has exports that are internal to the
  package (`ai-agent`, `knowledge`) — the barrel is the gate that keeps them
  private.

**Split files by concept, not by kind.** A file is named after the domain
thing it covers, and holds that thing's types, errors, and functions together:

- `api-client/src/` — one file per API area, mirroring
  `apps/api/src/modules/<domain>/` (`tickets.ts`, `knowledge.ts`,
  `operator.ts`, …), plus `client.ts` for `createApiClient`/`ApiClient`. A new
  endpoint goes in the file for its area, never into `index.ts`.
- `channels/src/` — one file per Channel Adapter (`web.ts`, `whatsapp.ts`),
  with the contract every adapter satisfies in `types.ts`. A new Channel is a
  new file.
- Don't create `utils.ts`/`helpers.ts`/`constants.ts` grab-bags; a private
  helper lives in the file that uses it, unexported.
- Files over ~400 lines are a signal to split along a concept boundary.

Subfolders are for a real group, like `ai-agent/src/prompts/` (prompt text,
one file per prompt, kept apart from the model-calling code in the parent).
Don't nest one or two files in a folder.

**`package.json` exports** use the short form, pointing straight at source —
packages are consumed as TypeScript, never built:

```json
"exports": {
  ".": "./src/index.ts",
  "./telemetry": "./src/telemetry.ts"
}
```

No `main`/`types` fields or `types`/`import`/`default` condition objects. Add
a subpath export only for an entry point that must be importable without the
rest of the package (e.g. `@repo/logger/telemetry`, which pulls in the
OpenTelemetry SDK). Every entry point also gets a matching `paths` entry in
`tsconfig.base.json`.

UI packages are the exception to the single barrel: `@repo/ui` keeps the
shadcn layout (`components/<name>.tsx`, `hooks/use-<name>.ts`,
`lib/<name>.ts`) and `@repo/layouts` has one file per layout, both exposed
through wildcard subpath exports (`@repo/ui/components/button`). That keeps
imports tree-shakeable and matches what the shadcn CLI generates. Components
there must stay domain-agnostic; anything that knows about Tickets or
Workspaces belongs in an app's `features/`.

Packages never import from `apps/*`, with one exception: `api-client`
imports `AppType` from `@repo/api` as a type only.

## Tests

Colocated next to the file they cover, as `<name>.test.ts` — no `__tests__/`
subfolders.
