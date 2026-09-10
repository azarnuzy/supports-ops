# apps/platform — folder & file structure

Feature-based structure under `src/features/<feature>/`. Never dump hooks,
types, constants, services, and every sub-component into one file — split by
concern, one thing per file. Reference: `/Users/azar/coding/free/bluebird/features`.

## Feature root

```
features/<feature>/
  index.ts                 # barrel: re-export the view(s) + anything other features import
  <feature>.hooks.ts        # react-query hooks, mutations, subscriptions
  <feature>.services.ts     # API calls (wraps @repo/api-client)
  <feature>.types.ts        # re-exported/local types shared across the feature
  views/<view-name>/...
  components/...            # only if shared across multiple views in the feature
```

## Each view: `views/<view-name>/`

```
<view-name>.tsx             # orchestrator only: composes hooks + components, thin JSX shell
<view-name>.hooks.ts        # view-local hooks (if the view has non-trivial state/logic)
<view-name>.types.ts        # view-local types (props, unions) — not shared elsewhere
<view-name>.constants.ts    # route maps, option lists, static config
<view-name>.utils.ts        # pure helper functions (formatters, predicates)
<view-name>.services.ts     # view-local API calls, if any
components/
  index.ts                  # barrel: export { default as X } from "./x"
  <component-name>/
    index.tsx               # default export
    index.types.ts          # props type(s)
    index.hooks.ts          # component-local hooks, if any
```

One component per folder, named in kebab-case, default-exported, imported via
the `components` barrel. A component only gets its own `index.hooks.ts` /
`index.types.ts` when it actually needs one — don't scaffold empty files.

## When to split a view file

Split `<view-name>.tsx` into `components/` when it renders more than one
independent unit (e.g. a list item, a dialog, a detail panel) — not because of
line count alone. A single cohesive form/screen that's merely long stays one
file. Rule of thumb: if a chunk of JSX has its own local `useState` cluster
or is reused/repeated (a row renderer, a card), pull it into its own
component folder.

## Example (chat feature, refactored 2026-09)

```
chat/views/chat/
  chat.tsx                  # orchestrator
  chat.types.ts             # TicketScope, DetailsTab, TimelineEntry
  chat.constants.ts         # scopeRoutes, statusFilterOptions
  chat.utils.ts             # senderName, bubbleVariant, formatBytes, ...
  components/
    index.ts
    ticket-row/
    all-ticket-row/
    ticket-inspector/
    detail-row/
    transcript-message/
    attachment-card/
    image-gallery/
    selected-file/
```
