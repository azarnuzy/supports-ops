import { fetchOperatorOrganizations } from "@repo/api-client";
import { Input } from "@repo/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ConsoleShell } from "../features/console/shell";
import { api } from "../lib/api";

export const Route = createFileRoute("/organizations")({ component: Organizations });

function Organizations() {
  const [search, setSearch] = useState("");
  const result = useQuery({
    queryKey: ["operator", "organizations", search],
    queryFn: () => fetchOperatorOrganizations(api, search),
  });
  return (
    <ConsoleShell>
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <Input
          aria-label="Search Organizations"
          placeholder="Search Organizations"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {result.isPending ? (
          <p>Loading Organizations...</p>
        ) : result.isError ? (
          <p role="alert">Failed to load Organizations.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {result.data.organizations.map((organization) => (
              <Link
                key={organization.id}
                to="/organizations/$organizationId"
                params={{ organizationId: organization.id }}
                className="flex justify-between gap-4 p-4 hover:bg-muted"
              >
                <span>
                  {organization.name}
                  <span className="ml-2 text-sm text-muted-foreground">
                    {organization.workspaces.length} Workspaces
                  </span>
                </span>
                <span className="tabular-nums">
                  {organization.balance.toLocaleString()} Credits
                </span>
              </Link>
            ))}
            {result.data.organizations.length === 0 && (
              <p className="p-4 text-muted-foreground">No Organizations found.</p>
            )}
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
