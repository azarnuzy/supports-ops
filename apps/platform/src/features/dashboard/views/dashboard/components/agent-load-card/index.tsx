import { ArrowRightIcon, InboxIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Link } from "@tanstack/react-router";
import {
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { formatResponseTime } from "../../dashboard.utils";
import DashboardCard from "../dashboard-card";
import type { AgentLoadCardProps } from "./index.types";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export default function AgentLoadCard({ agentStats }: AgentLoadCardProps) {
  return (
    <DashboardCard className="gap-3 py-3.5">
      <CardHeader className="px-3.5">
        <CardTitle className="text-sm leading-4">Human Agent Workload</CardTitle>
        <CardDescription className="text-xs leading-4">
          Active Human Agents and their assigned Tickets.
        </CardDescription>
        <CardAction>
          <Link
            to="/workspace/users"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View all agents
            <ArrowRightIcon className="size-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="px-3.5">
        {agentStats.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Human Agent</TableHead>
                <TableHead className="text-right">Open Tickets</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Resolved</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Avg. Response</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentStats.map((agent) => (
                <TableRow key={agent.humanAgentId}>
                  <TableCell>
                    <span className="flex items-center gap-2.5">
                      <Avatar className="size-7">
                        <AvatarFallback className="text-[11px] font-semibold text-foreground">
                          {initialsOf(agent.humanAgentName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate font-medium">{agent.humanAgentName}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {agent.openTicketCount}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {agent.resolvedCount}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                    {formatResponseTime(agent.avgFirstResponseSeconds)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
            <InboxIcon className="size-4 shrink-0" />
            No Human Agent activity in this range.
          </div>
        )}
      </CardContent>
    </DashboardCard>
  );
}
