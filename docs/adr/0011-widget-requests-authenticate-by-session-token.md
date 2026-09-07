# Widget requests authenticate by Web Session token, and carry their own CORS rules

Requests from the Web Widget are authenticated by the Web Session's unguessable access token, not by a signed-in user, and they resolve their Workspace from that Session. They also answer to a different CORS policy from the rest of the API: the allowed origin is looked up per request against the Workspace's configured allowed domains.

This is worth recording because the boilerplate points the other way on both counts, and following it would produce two real defects. The session-loading middleware is currently mounted on every route, and the Workspace isolation extension takes its Workspace from the authenticated user — but a Customer has no account and never signs in, so a widget request carries no user at all. And the CORS policy is a static allow-list of the product's own origins, while the widget by definition runs on domains belonging to other companies.

Widget routes therefore form their own segment of the API, with their own middleware: resolve the Web Session from its token, derive the Workspace from it, and reject the request when the requesting origin is not among that Workspace's allowed domains.

## Consequences

The Workspace isolation extension takes its context from either an authenticated user or a resolved Web Session, and must refuse to run a Workspace-scoped query when it has neither. A missing context is a bug, and failing closed is the only safe way for it to behave.

Origin checking is not a second implementation of the allowed-domain rule the PRD requires — it is the same one. One mechanism enforces both.
