# Deploy as containers to a VPS, not to Cloudflare

Every service ships as a container image built by GitHub Actions, published to GHCR tagged with the commit SHA, and pulled by a VPS that holds only runtime configuration, secrets, volumes, and the selected image tag. A shared Caddy instance terminates TLS and routes the three hostnames. Nothing is built on the server.

This is worth recording because the repository was scaffolded for Cloudflare — `apps/platform` and `apps/admin` each shipped a `wrangler.jsonc`, and CI validated the Workers bundles — so the leftovers are a trap for anyone who assumes the platform is still Cloudflare. Those files and CI steps are removed.

The product needs long-lived SSE connections, a BullMQ worker with durable timers, Postgres with the `vector` extension, and Redis; that shape belongs on a machine we control, and the developer already operates one under this exact contract. Attachments are the one exception: they go to Cloudflare R2 rather than a self-hosted MinIO, because object storage costs the VPS both RAM and the disk that Postgres needs, and R2 charges no egress for files served straight to Customers' browsers.
