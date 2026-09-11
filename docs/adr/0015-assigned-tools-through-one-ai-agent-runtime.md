---
status: superseded by 0016
---

# AI Agents use assigned Tools through one runtime

SupportOps replaces fixed, eagerly executed Business Tools with one Tool model covering Built-in, HTTP, and MCP Tools. The runtime derives an AI Agent's available Tools from Workspace-scoped Tool Assignments, enforces category-based Tool Policies before answering, and never lets model or Customer input broaden that set. This keeps one orchestration path and makes mandatory calls auditable; the alternative—separate execution paths or prompt-only permission rules—would allow the three Tool origins to drift or bypass authorization.

Platform safety instructions always outrank configurable AI Agent instructions. Remote MCP support begins with Streamable HTTP and static secret headers; broader transports and OAuth wait for a demonstrated need.
