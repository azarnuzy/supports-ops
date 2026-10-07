import { toast } from "@repo/ui/components/sonner";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import {
  pendingInvitationsQueryOptions,
  useInvitationMutations,
  workspaceUsersQueryOptions,
} from "../../../auth";

export function useHumanAgentsForm() {
  const users = useQuery(workspaceUsersQueryOptions);
  const pending = useQuery(pendingInvitationsQueryOptions);
  const { invite, resend, revoke } = useInvitationMutations();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "HUMAN_AGENT">("HUMAN_AGENT");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    invite.mutate(
      { email: email.trim(), role },
      {
        onError: (error) => toast.error(error.message),
        onSuccess: ({ status }) => {
          setEmail("");
          setOpen(false);
          toast.success(
            status === "added" ? "Added to the Workspace and notified." : "Invitation sent.",
          );
        },
      },
    );
  }

  const onError = (error: Error) => toast.error(error.message);

  return {
    email,
    handleSubmit,
    humanAgents: users.data?.users ?? [],
    invite,
    open,
    pending,
    pendingInvitations: pending.data?.invitations ?? [],
    resend: (id: string) =>
      resend.mutate(id, { onError, onSuccess: () => toast.success("Invitation resent.") }),
    revoke: (id: string) =>
      revoke.mutate(id, { onError, onSuccess: () => toast.success("Invitation revoked.") }),
    role,
    setEmail,
    setOpen,
    setRole,
    users,
    working: resend.isPending || revoke.isPending,
  };
}
