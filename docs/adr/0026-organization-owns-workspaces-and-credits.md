# Organizations own Workspaces and shared Credits

An Organization owns one or more Workspaces. Each Workspace isolates one business's Customers, Tickets, Knowledge, AI Agents, Channels, and ordinary member roles. One user belongs to one Organization and can belong to several of its Workspaces with a different role in each. An Organization Admin can create Workspaces, manage shared Billing, and act as an Admin in every Workspace, including claiming, taking over, and replying to Tickets. A single person can therefore run several businesses with one login; the initial Inbox stays scoped to the selected Workspace, with a switcher between them.

The Organization owns one Credit Ledger and receives one Trial Grant. Every Workspace's AI Agents spend from that balance, while each spend records its originating Workspace so AI Usage can be viewed both in total and by Workspace. Creating another Workspace grants no Credits. Credit Exhaustion affects all Workspaces sharing the balance; low-balance and exhaustion alerts go to Organization Admins. Only an Organization Admin manages Billing; a Workspace Admin sees usage for their own Workspace. Deleting a Workspace does not erase its historical spend or its identity in Organization usage reports. A Workspace cannot move to another Organization in the initial design.

## Considered Options

- **One Workspace with several AI Agents.** Rejected because the businesses need separate Customers, Tickets, Knowledge, Channels, and staff access, not merely different AI configurations.
- **A separate balance and Billing for each Workspace.** Rejected because one owner wants to fund and monitor all businesses together.
- **A separate Human Agent login for a solo operator.** Rejected because an Admin already claims and replies to Tickets, and the Organization Admin has that power in every Workspace.
- **One Inbox across all Workspaces immediately.** Deferred until the need to monitor several businesses without switching is demonstrated; each Workspace's Inbox already combines its Channels.

## Consequences

This changes the ownership stated in ADR-0021 and ADR-0023 from Workspace to Organization, while keeping their prepaid pricing and payment verification decisions. ADR-0008's Workspace data isolation remains; Organization Admin access is an explicit authorization to enter each Workspace, not a shared Customer or Ticket data pool. An Operator's Unlimited Period also moves from Workspace scope in ADR-0025 to Organization scope: it covers all current and subsequently created Workspaces, while preserving ADR-0025's zero-spend usage record and end-date behavior.

An Organization may have several Organization Admins but must retain at least one. Only an Organization Admin may grant that role. A Workspace Admin may invite staff only to their own Workspace; an Organization Admin may manage membership across all of theirs. Neither Workspace membership nor its Admin role grants Billing access. Registration creates an Organization and its first Workspace together; deleting the last Workspace through the ordinary Workspace flow is not allowed. At migration, each existing Workspace gets its own Organization, its existing Admin becomes an Organization Admin, and its Credit Ledger remains intact. The first release does not merge existing Organizations.

The Operator Console manages balance, Top-Ups, payments, and Unlimited Periods at Organization scope; Workspace views retain operational health and AI Usage attribution. Organization-level financial and attention totals count each Organization once, even when it owns several Workspaces. Operators remain separate from Organization users and cannot read Customer Messages (ADR-0024).
