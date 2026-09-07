# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo uses the single-context layout:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-monorepo-app-and-package-topology.md
│   └── 0002-anvia-v1-as-agent-runtime.md
├── apps/
└── packages/
```

The repo is a pnpm workspace, but its packages share one ubiquitous language: a Ticket, a Workspace, and a Knowledge Source mean the same thing in `apps/api` as they do in `packages/knowledge`. There is one glossary, at the root.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

Two that matter most here: never write **Agent** on its own — it is always **AI Agent** or **Human Agent** — and never conflate **AI Activity** (a product record shown to Admins) with **Telemetry** (a developer tool that is allowed to expire).

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0003 (pgvector over Qdrant), but worth reopening because…_
