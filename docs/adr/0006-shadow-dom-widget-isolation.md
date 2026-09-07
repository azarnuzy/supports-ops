# Shadow DOM for Web Widget style isolation

The Web Widget mounts as a custom element with an open shadow root attached directly to `<body>`, with Tailwind — preflight included — injected as adopted stylesheets **inside** the shadow root and `:host { all: initial }` at the boundary.

Scoped class names alone, whether from CSS modules or a CSS-in-JS library, were rejected: they prevent name collisions but do nothing about inheritance. A host site's `button { font-family: … }`, `* { box-sizing: content-box }`, or `div { line-height: 2 }` still cascades into anything that is not behind a shadow boundary. A full iframe would isolate at least as well but makes a floating launcher that must overlay host content and resize with its own state considerably harder.

Shadow DOM also lets the widget keep using the shared `packages/ui` components, so the product has one design system rather than a second UI stack maintained only for the widget.

## Consequences

`@font-face` declared inside a shadow root does not work in Chrome or Safari, and injecting font rules into the host document would be precisely the kind of leakage this decision avoids. The widget therefore uses a system font stack; the dashboard's own typography does not apply to it. Mounting as a direct child of `<body>` is load-bearing: nested inside host markup, the launcher can be trapped by an ancestor's stacking context.
