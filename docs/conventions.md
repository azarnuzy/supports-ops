# File and folder conventions

How `apps/platform` and `apps/api` are organized internally. This is about
naming and file layout inside an app — not app/package topology, which is
fixed by [ADR 0001](./adr/0001-monorepo-app-and-package-topology.md).

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

## Tests

Colocated next to the file they cover, as `<name>.test.ts` — no `__tests__/`
subfolders.
