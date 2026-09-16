import { ArrowRightIcon, GlobeIcon, MessageCircleIcon } from "lucide-react";

import { Badge } from "@repo/ui/components/badge";
import { StatusBadge } from "@repo/ui/components/ticket-badge";
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

import { formatRelativeTime } from "../../dashboard.utils";
import DashboardCard from "../dashboard-card";
import type { RecentConversationsCardProps } from "./index.types";

const channelIcon = { WEB: GlobeIcon, WHATSAPP: MessageCircleIcon } as const;

export default function RecentConversationsCard({ conversations }: RecentConversationsCardProps) {
  return (
    <DashboardCard className="gap-3 py-3.5">
      <CardHeader className="px-3.5">
        <CardTitle className="text-sm leading-4">Recent Conversations</CardTitle>
        <CardDescription className="text-xs leading-4">
          Latest activity across all Channels.
        </CardDescription>
        <CardAction>
          <Link
            to="/chat/all"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View all conversations
            <ArrowRightIcon className="size-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="px-3.5">
        {conversations.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="min-w-40">Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.map((conversation) => {
                const Icon = channelIcon[conversation.channel.type] ?? GlobeIcon;
                return (
                  <TableRow key={conversation.id}>
                    <TableCell className="max-w-32 truncate font-medium">
                      {conversation.customerIdentity.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1 px-1.5 text-[11px] font-normal">
                        <Icon className="size-3 text-muted-foreground" />
                        {conversation.channel.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-44 truncate text-muted-foreground">
                      {conversation.lastMessage?.content ?? "—"}
                    </TableCell>
                    <TableCell>
                      {conversation.ticket ? (
                        <StatusBadge status={conversation.ticket.status} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatRelativeTime(
                        conversation.lastMessage?.createdAt ?? conversation.createdAt,
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
            No Conversations in this Workspace yet.
          </div>
        )}
      </CardContent>
    </DashboardCard>
  );
}
