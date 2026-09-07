# pgvector over Qdrant for retrieval

Chunks are stored in Postgres via `@anvia/pgvector`, in the same database as Knowledge Sources and Tickets, rather than in a separate Qdrant instance.

The deciding reason is correctness, not performance. Soft-deleting a Knowledge Source or a Ticket must make its Chunks immediately unretrievable, and changing a Knowledge Source from Customer-Safe to Internal-Only must immediately stop it reaching Customers. With Chunks in the same database, both are a single transaction that cannot half-succeed. With a separate vector store, each is two writes to two systems that fail independently — and the failure mode is a document an Admin believes is deleted or hidden that the AI Agent still quotes to a Customer. A 4GB VPS with one less container and a single consistent `pg_dump` are secondary benefits.

Qdrant is the stronger engine at large scale and is what the developer used previously, so the rejection is not obvious. It stays viable: `packages/knowledge` exposes a single vector-store seam, so swapping adapters is a one-file change. Choosing Qdrant later means accepting a reconciliation job that re-asserts deletions and visibility changes after failed writes.

## Consequences

The Postgres instance needs the `vector` extension enabled before the first migration that creates a Chunk table.
