import type { TopUpPack, TopUpPayment, UnlimitedPeriod } from "@repo/api-client";
import { useQuery } from "@tanstack/react-query";
import {
  CheckIcon,
  CoinsIcon,
  ExternalLinkIcon,
  InfinityIcon,
  InfoIcon,
  ReceiptTextIcon,
} from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toast } from "@repo/ui/components/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import {
  aiUsageSummaryQueryOptions,
  billingQueryOptions,
  useTopUpCheckout,
} from "../ai-usage/ai-usage.hooks";
import {
  formatCredits,
  formatIdr,
  formatLedgerTimestamp,
  lowBalanceThreshold,
} from "../ai-usage/ai-usage.utils";
import { PlatformAppShell } from "../app-shell";
import { trailingRange } from "../dashboard/views/dashboard/dashboard.utils";
import ResourcePagination from "../settings/components/resource-pagination";
import { SettingsHeader } from "../settings/components/settings-header";

const paymentPageSize = 10;

const runwayRange = trailingRange(30);
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const paymentStatusStyles: Record<TopUpPayment["status"], { label: string; className: string }> = {
  PAID: {
    label: "Paid",
    className: "border-status-resolved/30 text-[var(--status-resolved-foreground)]",
  },
  PENDING: {
    label: "Awaiting payment",
    className: "border-amber-600/30 text-amber-700 dark:text-amber-400",
  },
  EXPIRED: { label: "Expired", className: "text-muted-foreground" },
};

function UnlimitedPeriodBanner({ unlimitedPeriod }: { unlimitedPeriod: UnlimitedPeriod | null }) {
  if (!unlimitedPeriod) return null;

  const active = !unlimitedPeriod.endedEarlyAt && new Date(unlimitedPeriod.endAt) > new Date();

  return active ? (
    <Alert>
      <InfinityIcon />
      <AlertTitle>Unlimited until {dateFormat.format(new Date(unlimitedPeriod.endAt))}</AlertTitle>
      <AlertDescription>
        Your AI Agents answer without spending Credits until then. Your balance won't change.
      </AlertDescription>
    </Alert>
  ) : (
    <Alert>
      <InfoIcon />
      <AlertTitle>Your Unlimited Period has ended</AlertTitle>
      <AlertDescription>This Workspace is back on its own Credits.</AlertDescription>
    </Alert>
  );
}

function BalanceCard({ balance }: { balance: number }) {
  const usage = useQuery(aiUsageSummaryQueryOptions(runwayRange));
  const dailyAverage = (usage.data?.aiUsage.totals.creditsSpent ?? 0) / 30;
  const runwayDays = dailyAverage > 0 ? Math.floor(Math.max(balance, 0) / dailyAverage) : null;
  const state = balance <= 0 ? "exhausted" : balance < lowBalanceThreshold ? "warning" : "normal";

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2 text-xs">
          <CoinsIcon className="size-3.5" />
          Credit balance
        </CardDescription>
        <CardTitle
          className={cn(
            "text-4xl font-semibold tracking-tight tabular-nums",
            state === "exhausted" && "text-destructive",
            state === "warning" && "text-amber-700 dark:text-amber-400",
          )}
        >
          {formatCredits(balance)}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1 text-sm text-muted-foreground">
        {state === "exhausted" ? (
          <p className="text-destructive">
            Credits are exhausted — the AI Agent escalates every new message to your team.
          </p>
        ) : null}
        {state === "warning" ? (
          <p>Below {lowBalanceThreshold} Credits. Top up soon to avoid Credit Exhaustion.</p>
        ) : null}
        <p>
          {runwayDays === null
            ? "No Credits spent in the last 30 days."
            : `About ${formatCredits(runwayDays)} days left at your 30-day average of ${dailyAverage.toFixed(1)} Credits per day.`}
        </p>
      </CardContent>
    </Card>
  );
}

function PackCard({
  pack,
  basePricePerCredit,
  isBestValue,
  disabled,
  isBuying,
  onBuy,
}: {
  pack: TopUpPack;
  basePricePerCredit: number;
  isBestValue: boolean;
  disabled: boolean;
  isBuying: boolean;
  onBuy: () => void;
}) {
  const pricePerCredit = pack.priceIdr / pack.credits;
  const discount = Math.round((1 - pricePerCredit / basePricePerCredit) * 100);

  return (
    <Card className={cn(isBestValue && "border-primary/50 shadow-md")}>
      <CardHeader>
        <CardDescription className="flex items-center justify-between text-xs">
          Top-Up Pack
          {isBestValue ? <Badge>Best value</Badge> : null}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">
          {formatCredits(pack.credits)} Credits
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div>
          <p className="text-xl font-semibold tabular-nums">{formatIdr(pack.priceIdr)}</p>
          <p className="text-xs text-muted-foreground">
            {formatIdr(pricePerCredit)} per Credit
            {discount > 0 ? (
              <span className="ml-1.5 font-medium text-[var(--status-resolved-foreground)]">
                Save {discount}%
              </span>
            ) : null}
          </p>
        </div>
        <ul className="grid gap-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <CheckIcon className="size-3.5 text-primary" />
            About {formatCredits(pack.credits)} AI replies at Model Rate 1
          </li>
          <li className="flex items-center gap-2">
            <CheckIcon className="size-3.5 text-primary" />
            One-time payment, nothing renews
          </li>
        </ul>
      </CardContent>
      <CardFooter className="mt-auto">
        <Button
          className="w-full"
          variant={isBestValue ? "default" : "outline"}
          disabled={disabled}
          onClick={onBuy}
        >
          {isBuying ? "Opening checkout…" : "Buy"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function PaymentHistory({ payments }: { payments: TopUpPayment[] }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(payments.length / paymentPageSize));
  const currentPage = Math.min(page, pageCount);
  const pagePayments = payments.slice(
    (currentPage - 1) * paymentPageSize,
    currentPage * paymentPageSize,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Payment history</CardTitle>
        <CardDescription className="text-xs">
          Your most recent Top-Up checkouts. Receipts are emailed by Mayar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {payments.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Pack</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagePayments.map((payment) => {
                  const status = paymentStatusStyles[payment.status];
                  return (
                    <TableRow key={payment.id}>
                      <TableCell className="text-muted-foreground">
                        {formatLedgerTimestamp(payment.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">
                        {formatCredits(payment.credits)} Credits
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatIdr(payment.amountIdr)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={status.className}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {payment.checkoutUrl ? (
                          <Button asChild size="sm" variant="ghost">
                            <a href={payment.checkoutUrl} target="_blank" rel="noreferrer">
                              Continue payment
                              <ExternalLinkIcon className="size-3.5" />
                            </a>
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <ResourcePagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
          </>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
            <ReceiptTextIcon className="size-4 shrink-0" />
            No Top-Ups bought yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const BillingView = () => {
  const billing = useQuery(billingQueryOptions);
  const checkout = useTopUpCheckout();

  // The tab opens inside the click so popup blockers allow it; checkout fills it in.
  const buy = (packId: string) => {
    const checkoutTab = window.open("", "_blank");
    checkout.mutate(packId, {
      onError: (error) => {
        checkoutTab?.close();
        toast.error(error.message);
      },
      onSuccess: ({ payment }) => {
        if (!payment.checkoutUrl) return;
        if (checkoutTab) checkoutTab.location.href = payment.checkoutUrl;
        else window.location.assign(payment.checkoutUrl);
        toast.success("Checkout opened in a new tab. Your Credits appear here once you pay.");
      },
    });
  };

  const data = billing.data?.billing;
  const basePricePerCredit = data?.packs.length
    ? Math.max(...data.packs.map((pack) => pack.priceIdr / pack.credits))
    : 1;
  const bestValueId = data?.packs.length
    ? data.packs.reduce((best, pack) =>
        pack.priceIdr / pack.credits < best.priceIdr / best.credits ? pack : best,
      ).id
    : null;

  return (
    <PlatformAppShell>
      <section className="grid gap-6">
        <SettingsHeader
          title="Billing"
          description="Buy Credits for your AI Agents. Pay once per Top-Up Pack — nothing renews on its own."
        />

        {billing.isPending ? (
          <div className="grid gap-4">
            <Skeleton className="h-36 w-full rounded-xl" />
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-72 rounded-xl" />
              ))}
            </div>
          </div>
        ) : null}

        {billing.isError ? (
          <div className="grid place-items-center gap-3 rounded-xl border border-dashed p-12 text-center">
            <p className="text-sm text-destructive">{billing.error.message}</p>
            <Button size="sm" variant="outline" onClick={() => void billing.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}

        {data ? (
          <>
            <UnlimitedPeriodBanner unlimitedPeriod={data.unlimitedPeriod} />

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <BalanceCard balance={data.balance} />
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">How Credits are spent</CardTitle>
                  <CardDescription className="text-xs">
                    Each AI reply or Follow-Up costs its Agent Model's Model Rate — however many
                    Tool calls or Tokens it used. Everything else is included.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent Model</TableHead>
                        <TableHead className="text-right">Credits per reply</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.modelRates.map((model) => (
                        <TableRow key={model.id}>
                          <TableCell className="font-medium">{model.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{model.rate}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {!data.paymentsEnabled ? (
              <Alert>
                <InfoIcon />
                <AlertTitle>Online payment isn't set up yet</AlertTitle>
                <AlertDescription>
                  Contact SupportOps to top up your Credits by bank transfer.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              {data.packs.map((pack) => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  basePricePerCredit={basePricePerCredit}
                  isBestValue={pack.id === bestValueId && data.packs.length > 1}
                  disabled={!data.paymentsEnabled || checkout.isPending}
                  isBuying={checkout.isPending && checkout.variables === pack.id}
                  onBuy={() => buy(pack.id)}
                />
              ))}
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              Prices in Rupiah, including 11% VAT (PPN). Payments are processed by Mayar — bank
              transfer, QRIS, e-wallets, and minimarket.
            </p>

            <PaymentHistory payments={data.payments} />
          </>
        ) : null}
      </section>
    </PlatformAppShell>
  );
};

export default BillingView;
