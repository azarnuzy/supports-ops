# Server-sent events for realtime, with one inbound channel per widget

All server-to-client push uses SSE over plain HTTP, fanned out through Redis pub/sub. There is no WebSocket anywhere in the product. The Web Widget holds exactly **one** inbound SSE connection carrying everything — AI Agent tokens, Human Agent messages, Handoff, status changes — while everything the Customer sends is an ordinary POST.

WebSocket was rejected because nothing here is duplex: the product explicitly disables Customer input while the AI Agent is generating, so there is never concurrent two-way traffic. WebSocket would have added sticky sessions behind the shared proxy plus hand-written reconnect and heartbeat logic, in exchange for nothing.

The single-channel choice is the surprising part, because it means **not** using `@anvia/react`'s `useChat` and its transport, and writing a small `EventSource` hook instead. `useChat` assumes the only counterpart is an agent, which stops being true the moment a Ticket is escalated: from then on there is no agent run at all, and a widget built around the agent stream has no way to receive a human's reply. Routing every inbound event through one channel means the widget renders one ordered conversation whose ordering comes from the server, behaves identically in every Ticket status, and reuses the same read path for the read-only transcript on a closed Session Link. `@anvia/core` and `@anvia/server` are still used in full on the server side; only the client transport is ours.

## Consequences

**Replay is not free, and must be built.** SSE reconnects on its own, but Redis pub/sub does not buffer: a client that drops its connection receives nothing that was published while it was away. The browser sends `Last-Event-ID` on reconnect, and the server must answer it by **querying messages after that position from the database**, then resuming the live subscription. Treating reconnection as sufficient would silently lose messages whenever a Customer's signal drops — which on a mobile network is routine, not exceptional.

**Streaming fragments are not Messages.** An AI Agent reply has no row, and therefore no ordering position, until it is complete. The stream therefore carries two distinct kinds of event: fragments during generation, which reference a provisional identifier and carry no position, and a completion event carrying the persisted row with its real position. The widget renders fragments into a temporary bubble and replaces it on completion. Attempting to assign positions to fragments would collide with the uniqueness constraint on the message table.

**Delivery is never load-bearing for correctness.** Claiming a Ticket is made safe by a conditional database update; the event only announces the outcome. Anything that must be true regardless of whether a client was connected is enforced in the database.
