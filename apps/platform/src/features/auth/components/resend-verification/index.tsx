import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { useEffect, useState } from "react";
import { useResendVerificationMutation } from "../../auth.hooks";

const cooldownSeconds = 60;

/** `justSent` starts the 60 s cooldown the API enforces after every send. */
export function ResendVerification({
  email,
  justSent = false,
}: {
  email: string;
  justSent?: boolean;
}) {
  const resend = useResendVerificationMutation();
  const [remaining, setRemaining] = useState(justSent ? cooldownSeconds : 0);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((seconds) => seconds - 1), 1_000);
    return () => clearTimeout(timer);
  }, [remaining]);

  return (
    <Button
      type="button"
      variant="outline"
      disabled={resend.isPending || remaining > 0}
      onClick={() =>
        resend.mutate(email, {
          onError: (error) => toast.error(error.message),
          onSuccess: () => {
            setRemaining(cooldownSeconds);
            toast.success("Verification email sent.");
          },
        })
      }
    >
      {remaining > 0 ? `Resend email (${remaining}s)` : "Resend email"}
    </Button>
  );
}
