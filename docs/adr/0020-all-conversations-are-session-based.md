---
status: accepted
---

# All Conversations is a Session-based read model

All Conversations reads one Workspace-scoped Session list with an optional Ticket projection, because every Customer conversation already has a Session while only a meaningful support request produces a Ticket. A single endpoint owns ordering and cursoring across both cases; the UI may filter Sessions without a Ticket, but they do not form a separate queue or navigation area.

## Consequences

The existing Ticket-only and no-Ticket lists must not be merged in the client. Ticket status, priority, category, and assignee remain absent when a Session has no Ticket.
