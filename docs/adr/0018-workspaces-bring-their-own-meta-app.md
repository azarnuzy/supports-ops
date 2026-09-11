# Workspaces bring their own Meta App, and webhooks route by phone number ID

A Workspace connecting WhatsApp creates its own Meta App and its own WhatsApp Business Account, then hands SupportOps four values: Phone Number ID, WABA ID, a permanent access token, and the App Secret. SupportOps generates the verify token and displays the callback URL. Every Workspace posts to the *same* callback URL, and the tenant is resolved from `phone_number_id` in the payload.

Meta's Embedded Signup — one SupportOps-owned app, a Facebook login button, thirty seconds of customer effort — is a materially better onboarding experience and was still rejected. It requires Meta Tech Provider verification, which takes weeks of business review and is not obtainable during development. Choosing it would mean WhatsApp cannot be built at all until that review clears.

A callback URL per Workspace (`/webhooks/whatsapp/:channelId`) was rejected as security theatre. The URL is guessable and is handed to a third party regardless, so it can never be the thing that establishes trust; `X-Hub-Signature-256` is. A per-Workspace path adds routing surface and changes nothing about what has to be verified.

## Consequences

**`phone_number_id` is globally unique, not unique per Workspace.** It is the only routing key, so two Workspaces claiming the same number is a conflict the database must reject, not a situation the application resolves.

**Signature verification reads the raw body, and the lookup happens before trust is established.** The App Secret is per-Workspace, so the Workspace must be identified before its signature can be checked — the one thing parsed ahead of verification is `phone_number_id`, used solely to fetch a Channel. Nothing in the body is acted upon until the HMAC over the raw bytes matches that Channel's App Secret. The handler must therefore read the body as text and compute the HMAC over exactly those bytes; re-serializing parsed JSON produces a different digest and fails for all the wrong reasons.

**Access tokens are encrypted at rest and never returned to a client.** A permanent access token is non-expiring and grants full control of the customer's business phone number. It is stored encrypted with a key from the environment, and the API returns only its last four characters. This is the first encrypted column in the product; `WebWidgetConfig` stores plaintext because none of its fields are secrets.

**Onboarding validates before it instructs.** The callback URL and verify token are only shown after the credentials are verified against the Graph API. Showing them first invites the customer to configure Meta with credentials that turn out to be wrong, and the resulting failure appears on Meta's side where it cannot be explained.
