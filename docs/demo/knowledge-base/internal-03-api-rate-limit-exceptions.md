# Internal SOP: granting API rate limit exceptions

**Visibility: Internal-Only**

The default API rate limit is 600 requests/minute per key. Customers occasionally ask for a higher limit for a specific integration. This is never granted from chat directly.

When a Customer asks for a rate limit increase:

1. Ask what the integration does and its expected peak request rate. Vague answers ("just in case") are not sufficient justification.
2. Check the Workspace's plan and payment status with the Business Tools — rate limit exceptions are only available to Pro plan Workspaces in good standing (not `PAST_DUE` or `OVERDUE`).
3. Record the requested limit and stated use case in the Handoff. Engineering applies the actual limit change manually after review; it is not an instant action a Human Agent can take from the support tooling.

Do not tell the Customer a specific new limit or timeline — say that the request has been logged for review. Overpromising here has caused integration outages in the past when the promised limit was not actually applied in time.
