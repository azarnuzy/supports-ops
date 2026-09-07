# Design System

The token, typography, and component baseline the dashboard and the Web Widget build against. Colour and layout are taken from the shadcn admin template already on disk; the additions here are the parts that template has no opinion about, because they are specific to a support product — status colour, sender attribution, and widget isolation.

## Where this comes from

`packages/ui` already ships 56 shadcn components on Base UI and Radix with the stock neutral theme. The reference template contributes its **default** palette — which, checked against the file, is the same neutral grayscale `packages/ui` already has — plus three things it does have and `packages/ui` does not: a radius scale extended to `4xl`, Geist and Geist Mono wired as `--font-sans` and `--font-mono`, and a `data-theme-preset` mechanism carrying three optional themes.

So adopting the template's palette is close to a no-op on colour, and the real work is the additions below.

## Colour

**Base: neutral, both modes.** `--primary` is near-black in light and near-white in dark. There is no brand hue.

That is a decision, not an omission. On the Inbox screen a Human Agent scans dozens of rows for status and priority; those signals only read if the surrounding chrome is colourless. A brand accent would compete with exactly the information the screen exists to convey.

The template's three presets (`tangerine`, `soft-pop`, `brutalist`) are ported and remain switchable via `data-theme-preset`, so the choice stays open without being made now.

### Status tokens

New tokens, defined for both modes, and the only saturated colour in the dashboard:

| Token | Status | Hue | Reads as |
|---|---|---|---|
| `--status-ai` | `AI_HANDLING` | blue | in progress, automated |
| `--status-escalated` | `ESCALATED` | amber | waiting on a person |
| `--status-human` | `HUMAN_HANDLING` | violet | a person has it |
| `--status-resolved` | `RESOLVED` | green | done |

Light mode sits around `oklch(0.62 0.14 240)`, `oklch(0.72 0.15 70)`, `oklch(0.58 0.16 295)`, `oklch(0.60 0.13 155)`; dark mode lifts lightness and drops chroma so the badges do not glow.

### Priority

Priority uses a **different visual channel** rather than a fifth hue — outline badge with a leading dot, not a filled badge. Two reasons: amber is already spoken for by `ESCALATED`, and priority genuinely matters less, because it is displayed but does not order the Shared Human Queue.

| Priority | Treatment |
|---|---|
| `LOW` | muted dot, muted text |
| `NORMAL` | foreground dot, foreground text |
| `HIGH` | red dot (`oklch(0.58 0.20 25)`), red text |

`HIGH` deliberately does not reuse `--destructive`; that token means *this action deletes something* and should not also mean *this ticket is urgent*.

### One source of truth

Status and priority appear in the Inbox, the queue, the Ticket header, and the analytics dashboard. Both mappings are `cva` variants layered on the shared `Badge` — one place defines which status is which colour. Nothing hardcodes a status colour inline.

## Typography

| Role | Font | Size |
|---|---|---|
| Page heading | Geist | `text-2xl font-semibold` |
| Section heading | Geist | `text-lg font-semibold` |
| Body and interface | Geist | `text-sm` |
| Message content | Geist | `text-sm leading-relaxed` |
| Meta — timestamps, counts, labels | Geist | `text-xs text-muted-foreground` |
| Ticket ids, widget keys, tool names, tokens | **Geist Mono** | `text-xs` |

One sans family. No serif: this is a dense operational interface, and a display face would buy nothing for the bundle weight. Geist Mono earns its place because the product is full of identifiers a person has to compare character by character — ticket ids, widget keys, external customer ids, tool names in the Activity Timeline.

## Layout

**Inset sidebar.** The dashboard shell uses `variant="inset"`, already supported in the shared sidebar component.

**Ticket detail lives inside that shell.** The reference template's chat page uses a different, non-inset layout of its own, so the two things being adopted come from two different places. They are reconciled by putting Ticket detail inside the inset shell and using the template's own full-bleed escape hatch — the dashboard layout already supports opting a page out of padding. Navigation stays constant while the conversation gets the room it needs.

The cost is height arithmetic: the conversation column measures against the inset's available height rather than the viewport, and every panel in the chain needs `min-h-0` for the inner scroll to work rather than the page growing.

### Screens

| Route | Purpose |
|---|---|
| `/login` | Sign in |
| `/register` | Admin registration, creates the Workspace |
| `/` | Dashboard analytics |
| `/inbox` | Ticket list with filters |
| `/queue` | Shared Human Queue |
| `/tickets/:id` | Conversation + Activity Timeline |
| `/knowledge` | Knowledge Sources |
| `/knowledge/:id` | Source detail, visibility, status |
| `/settings/widget` | Web Widget configuration and embed snippet |
| `/settings/agents` | Human Agent accounts |
| `/settings/ai` | Follow-Up and Auto-Resolution timing |

Inbox filters: status, category, priority, assignee. Search covers Customer name and email only — full-text conversation search is out of scope.

Ticket detail is two panes: Conversation, and Activity Timeline. The timeline is a product view of AI Activity, not a log dump — each entry reads as a sentence with a time, and tool names and source ids are set in mono.

## Chat components

The reference template's chat page depends on five components that `packages/ui` **does not have**: `bubble`, `message`, `message-scroller`, `marker`, and `attachment`. These are ported into `packages/ui` so the dashboard and the widget render conversations from the same primitives.

Ported as-is, then extended for four sender types rather than the template's two:

| Sender | Treatment |
|---|---|
| Customer | Left, `card` surface, avatar with initials |
| AI Agent | Left, subtly tinted with `--status-ai`, bot icon, labelled with the configured bot name |
| Human Agent | Right, `primary` surface, the person's avatar |
| System — handoff, closing, takeover notice | Centred, `marker`, muted, no avatar |

Distinguishing AI Agent from Human Agent visually is a product requirement, not decoration: the PRD requires Customers be told they are talking to an AI first, and a Human Agent reading history needs to see at a glance what the Customer was already told by the AI Agent.

Additional states these components must carry: streaming (a token cursor while the AI Agent generates), delivery failure, and an Attachment preview with its processing state.

## Web Widget

The widget uses the same components and tokens, with three deliberate differences:

1. **System font stack**, not Geist. `@font-face` declared inside a shadow root does not work in Chrome or Safari, and injecting the rule into the host document would be exactly the leakage the shadow root exists to prevent. A system stack also makes the widget feel native on whatever site it lands on.
2. **Primary colour comes from the Workspace at runtime**, set as a CSS custom property on the shadow host from the widget configuration. It is not the dashboard's `--primary` and is not baked into the build.
3. **Tailwind, preflight included, is injected inside the shadow root** as adopted stylesheets, with `:host { all: initial }` at the boundary. Everything the widget renders is scoped there.

Presented as a floating launcher anchored bottom-right, mounted as a direct child of `<body>` — nested inside host markup, it could be trapped by an ancestor's stacking context.

Widget surfaces: launcher, pre-chat form, conversation, and the read-only transcript reached from a Session Link. Chrome strings come from a small two-language table selected from the browser locale, since the AI Agent replies in the Customer's language.

## What is not built

- **No dark-mode toggle work beyond the tokens.** Both modes are defined; the switcher already exists in the shared library.
- **No custom form components.** Field, Input, and Label from the shared library, composed per view.
- **No chart work beyond the shared chart component.** Four analytics figures, three of them counts.
- **No internationalisation.** The dashboard is English only; the widget's string table is not a substitute for it.
