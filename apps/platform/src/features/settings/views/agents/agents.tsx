import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { Field, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  setWorkspaceUserRole,
  deleteWorkspaceUser,
  setOrganizationAdminRole,
} from "../../../auth/auth.services";
import { meQueryOptions } from "../../../auth";
import { queryKeys } from "../../../../lib/query-keys";
import { toast } from "@repo/ui/components/sonner";
import { CopyIcon, RefreshCwIcon, UserPlusIcon, UsersRoundIcon } from "lucide-react";
import { PlatformAppShell } from "../../../app-shell";
import { getInitials } from "../../../../lib/utils";
import { SettingsHeader } from "../../components/settings-header";
import ResourceListState from "../../components/resource-list-state";
import { useHumanAgentsForm } from "./agents.hooks";

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

async function copyEmail(email: string) {
  try {
    await navigator.clipboard.writeText(email);
    toast.success("Email address copied.");
  } catch {
    toast.error("Failed to copy the email address.");
  }
}

const UsersView = () => {
  const {
    email,
    handleSubmit,
    humanAgents,
    invite,
    open,
    pendingInvitations,
    resend,
    revoke,
    role,
    setEmail,
    setOpen,
    setRole,
    users,
    working,
  } = useHumanAgentsForm();
  const currentUser = useQuery(meQueryOptions).data;
  const queryClient = useQueryClient();
  const manage = useMutation({
    mutationFn: async (action: {
      id: string;
      role?: "ADMIN" | "HUMAN_AGENT";
      organizationAdmin?: boolean;
      remove?: boolean;
    }) => {
      if (action.role) return setWorkspaceUserRole(action.id, action.role);
      if (action.organizationAdmin !== undefined)
        return setOrganizationAdminRole(action.id, action.organizationAdmin);
      if (action.remove) return deleteWorkspaceUser(action.id);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.users }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update user."),
  });

  const isEmpty = !users.isPending && !users.isError && humanAgents.length === 0;

  return (
    <PlatformAppShell>
      <section className="grid gap-6">
        <SettingsHeader
          eyebrow="Workspace"
          title="Users"
          description="Manage Workspace roles and invite people by email."
        />

        <div className="grid items-start gap-5">
          <Card className="gap-5">
            <CardHeader>
              <CardTitle className="text-base">Team</CardTitle>
              <CardDescription>
                {isEmpty
                  ? "People with access to this Workspace."
                  : `${humanAgents.length} Workspace member${humanAgents.length === 1 ? "" : "s"}.`}
              </CardDescription>
              <CardAction className="flex gap-2">
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" type="button">
                      <UserPlusIcon className="size-4" />
                      Invite
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form className="grid gap-5" onSubmit={handleSubmit}>
                      <DialogHeader>
                        <DialogTitle>Invite a user</DialogTitle>
                        <DialogDescription>
                          They get an email link, choose their own password, and join this
                          Workspace. Valid for 7 days.
                        </DialogDescription>
                      </DialogHeader>
                      <Field>
                        <FieldLabel className="text-sm font-medium" htmlFor="invite-email">
                          Work email
                        </FieldLabel>
                        <Input
                          id="invite-email"
                          autoComplete="off"
                          placeholder="amara@yourcompany.com"
                          required
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="invite-role">Workspace role</FieldLabel>
                        <select
                          id="invite-role"
                          className="h-9 rounded-md border bg-background px-3"
                          value={role}
                          onChange={(event) =>
                            setRole(event.target.value as "ADMIN" | "HUMAN_AGENT")
                          }
                        >
                          <option value="HUMAN_AGENT">Human Agent</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </Field>
                      <DialogFooter>
                        <Button type="submit" disabled={invite.isPending}>
                          {invite.isPending ? "Sending…" : "Send Invitation"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  disabled={users.isFetching}
                  onClick={() => void users.refetch()}
                >
                  <RefreshCwIcon className={users.isFetching ? "size-4 animate-spin" : "size-4"} />
                  Refresh
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ResourceListState
                isPending={users.isPending}
                skeletonCount={3}
                isError={users.isError}
                errorLabel="Unable to load Workspace members."
                onRetry={() => void users.refetch()}
                isEmpty={isEmpty}
                emptyIcon={<UsersRoundIcon className="size-5 text-muted-foreground" />}
                emptyTitle="No members yet"
                emptyDescription="Invite a member with the Invite button."
              />

              {humanAgents.length > 0 ? (
                <ul className="grid gap-2">
                  {humanAgents.map((humanAgent) => (
                    <li
                      key={humanAgent.id}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <Avatar className="size-9 shrink-0 rounded-lg">
                        <AvatarFallback className="rounded-lg text-xs font-medium">
                          {getInitials(humanAgent.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{humanAgent.name}</p>
                        <p className="truncate text-[13px] text-muted-foreground">
                          {humanAgent.email}
                        </p>
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <Badge variant="secondary">
                          {humanAgent.role === "ADMIN" ? "Admin" : "Human Agent"}
                        </Badge>
                        {humanAgent.isOrganizationAdmin ? (
                          <Badge variant="secondary">Organization Admin</Badge>
                        ) : null}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Added {dateFormatter.format(new Date(humanAgent.createdAt))}
                        </p>
                      </div>
                      <Button
                        aria-label={`Copy ${humanAgent.email}`}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                        onClick={() => void copyEmail(humanAgent.email)}
                      >
                        <CopyIcon className="size-4" />
                      </Button>
                      <select
                        aria-label={`Role for ${humanAgent.name}`}
                        className="rounded-md border bg-background p-1 text-xs"
                        value={humanAgent.role}
                        disabled={manage.isPending}
                        onChange={(event) =>
                          manage.mutate({
                            id: humanAgent.id,
                            role: event.target.value as "ADMIN" | "HUMAN_AGENT",
                          })
                        }
                      >
                        <option value="HUMAN_AGENT">Human Agent</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      {currentUser?.isOrganizationAdmin ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={manage.isPending}
                          onClick={() =>
                            manage.mutate({
                              id: humanAgent.id,
                              organizationAdmin: !humanAgent.isOrganizationAdmin,
                            })
                          }
                        >
                          {humanAgent.isOrganizationAdmin ? "Revoke Org Admin" : "Make Org Admin"}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={manage.isPending}
                        onClick={() => manage.mutate({ id: humanAgent.id, remove: true })}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          {pendingInvitations.length > 0 ? (
            <Card className="gap-5">
              <CardHeader>
                <CardTitle className="text-base">Pending Invitations</CardTitle>
                <CardDescription>
                  Resending renews the 7-day expiry and replaces the old link.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2">
                  {pendingInvitations.map((invitation) => {
                    const expired = new Date(invitation.expiresAt) <= new Date();
                    return (
                      <li
                        key={invitation.id}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{invitation.email}</p>
                          <p className="truncate text-[13px] text-muted-foreground">
                            Invited by {invitation.invitedByName} ·{" "}
                            {expired
                              ? "expired"
                              : `expires ${dateFormatter.format(new Date(invitation.expiresAt))}`}
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {invitation.role === "ADMIN" ? "Admin" : "Human Agent"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={working}
                          onClick={() => resend(invitation.id)}
                        >
                          Resend
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={working}
                          onClick={() => revoke(invitation.id)}
                        >
                          Revoke
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>
    </PlatformAppShell>
  );
};

export default UsersView;
