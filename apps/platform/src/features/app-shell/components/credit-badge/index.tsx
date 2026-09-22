import { Badge } from "@repo/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CoinsIcon } from "lucide-react";
import { meQueryOptions } from "../../../auth";
import { aiUsageSummaryQueryOptions } from "../../../ai-usage/ai-usage.hooks";
import { formatCredits, lowBalanceThreshold } from "../../../ai-usage/ai-usage.utils";
import { trailingRange } from "../../../dashboard/views/dashboard/dashboard.utils";

const badgeRange = trailingRange(1);

export function CreditBadge() {
  const user = useQuery(meQueryOptions);
  const usage = useQuery({
    ...aiUsageSummaryQueryOptions(badgeRange),
    enabled: user.data?.role === "ADMIN",
    refetchInterval: 30_000,
  });

  if (user.data?.role !== "ADMIN" || !usage.data) return null;

  const balance = usage.data.aiUsage.balance;
  const state = balance <= 0 ? "exhausted" : balance < lowBalanceThreshold ? "warning" : "normal";

  const stateStyles = {
    exhausted: "border-destructive/30 bg-destructive/10 text-destructive",
    normal: "text-muted-foreground",
    warning: "border-amber-600/30 text-amber-700 dark:text-amber-400",
  } as const;

  const stateMessage = {
    exhausted: "Credits are exhausted. The AI Agent has stopped answering until you Top-Up.",
    normal: `${formatCredits(balance)} Credits remaining.`,
    warning: `${formatCredits(balance)} Credits remaining — Top-Up soon.`,
  } as const;

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to="/workspace/ai-usage">
            <Badge variant="outline" className={stateStyles[state]}>
              <CoinsIcon className="size-3.5" />
              {formatCredits(balance)}
            </Badge>
          </Link>
        </TooltipTrigger>
        <TooltipContent>{stateMessage[state]}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
