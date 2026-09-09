# Web Widget stays vanilla JS/TS, not React

The Web Widget (`apps/widget`) loads via a single `<script>` tag on arbitrary third-party customer websites and currently ships as a ~4KB framework-free bundle. We considered rewriting it in React — with either Tailwind or styled-components, to match `apps/platform` and reuse `packages/ui` — but decided to keep it vanilla JS/TS: React + ReactDOM alone would add ~45KB gzipped to a script that must load fast on someone else's homepage, for a widget whose UI surface is small and changes rarely.

This corrects a claim in ADR-0006: that ADR frames Shadow DOM isolation as *also* letting the widget "keep using the shared `packages/ui` components." The widget has never pulled in `packages/ui` or React, and this decision makes that permanent rather than provisional — Shadow DOM here isolates the widget's own hand-written CSS from the host page, not a second copy of the dashboard's design system.

## Consequences

The widget keeps hand-writing its UI as template-string HTML + scoped CSS inside the Shadow DOM (see `apps/widget/src/widget.ts`), with DOMPurify + marked for message rendering. Any component work shared with `apps/platform` (buttons, form fields, etc.) is not reusable here and would need to be hand-duplicated if ever wanted. Styling additions (e.g. a widget logo) extend the existing plain-CSS approach rather than introducing Tailwind or CSS-in-JS.
