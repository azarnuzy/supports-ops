import { topUpWorkspace } from "@repo/api-client";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Field, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { toast } from "@repo/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../../../../lib/api";

const numberFormat = new Intl.NumberFormat();

export function TopUpDialog({
  workspaceId,
  balance,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  balance: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [credits, setCredits] = useState("");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  const parsedCredits = Number(credits);
  const isValid = Number.isInteger(parsedCredits) && parsedCredits > 0 && note.trim().length > 0;

  function reset() {
    setStep("form");
    setCredits("");
    setNote("");
  }

  const mutation = useMutation({
    mutationFn: () => topUpWorkspace(api, workspaceId, { credits: parsedCredits, note: note.trim() }),
    onSuccess: () => {
      toast.success(`Topped up ${numberFormat.format(parsedCredits)} Credits.`);
      queryClient.invalidateQueries({ queryKey: ["operator", "workspace", workspaceId] });
      onOpenChange(false);
      reset();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to record the Top-Up."),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        {step === "form" ? (
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (isValid) setStep("confirm");
            }}
          >
            <DialogHeader>
              <DialogTitle>Record a Top-Up</DialogTitle>
              <DialogDescription>
                Add Credits for a payment made outside the platform.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="top-up-credits">Credits</FieldLabel>
              <Input
                id="top-up-credits"
                type="number"
                min={1}
                step={1}
                required
                value={credits}
                onChange={(event) => setCredits(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="top-up-note">Note</FieldLabel>
              <Textarea
                id="top-up-note"
                required
                rows={3}
                placeholder="Reference this Top-Up to its payment"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid}>
                Continue
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="grid gap-5">
            <DialogHeader>
              <DialogTitle>Confirm Top-Up</DialogTitle>
              <DialogDescription>Check the amount before it is recorded.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 rounded-md border p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current balance</span>
                <span className="tabular-nums">{numberFormat.format(balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Top-Up</span>
                <span className="tabular-nums">+{numberFormat.format(parsedCredits)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Resulting balance</span>
                <span className="tabular-nums">{numberFormat.format(balance + parsedCredits)}</span>
              </div>
              <p className="mt-2 text-muted-foreground">{note.trim()}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("form")}>
                Back
              </Button>
              <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending ? "Recording..." : "Confirm Top-Up"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
