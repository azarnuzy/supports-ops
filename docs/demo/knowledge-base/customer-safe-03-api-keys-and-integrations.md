# API keys and integrations

**Visibility: Customer-Safe**

Pro plan Workspaces can generate API keys from **Settings → Developers** to integrate SupportOps with other systems, such as pushing new tickets into an external CRM or pulling analytics into a BI tool.

Each API key is scoped to a single Workspace and shown only once at creation time — copy it immediately, since we only store a hashed version afterward. If a key is lost, revoke it and generate a new one; revoking takes effect immediately and does not require a Workspace restart.

Rate limits are 600 requests per minute per API key. Requests beyond that limit receive a `429` response with a `Retry-After` header. If your integration consistently needs a higher limit, a Human Agent can discuss raising it case by case.

Starter plan Workspaces do not have API access. Upgrading to Pro unlocks it immediately without needing to regenerate existing data.
