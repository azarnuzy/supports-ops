import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { setWorkspaceUserRole, deleteWorkspaceUser, setOrganizationAdminRole } from "../../../auth/auth.services";
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
    createHumanAgent,
    email,
    handleSubmit,
    humanAgents,
    name,
    password,
    role,
    setEmail,
    setName,
    setPassword,
    setRole,
    users,
  } = useHumanAgentsForm();
  const currentUser = useQuery(meQueryOptions).data;
  const queryClient = useQueryClient();
  const manage = useMutation({
    mutationFn: async (action: { id: string; role?: "ADMIN" | "HUMAN_AGENT"; organizationAdmin?: boolean; remove?: boolean }) => {
      if (action.role) return setWorkspaceUserRole(action.id, action.role);
      if (action.organizationAdmin !== undefined) return setOrganizationAdminRole(action.id, action.organizationAdmin);
      if (action.remove) return deleteWorkspaceUser(action.id);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.users }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update user."),
  });

  const passwordTooShort = password.length > 0 && password.length < 8;
  const isEmpty = !users.isPending && !users.isError && humanAgents.length === 0;

  return (
    <PlatformAppShell>
      <section className="grid gap-6">
        <SettingsHeader
          eyebrow="Workspace"
          title="Users"
          description="Manage Workspace roles and add people from your Organization with one login."
        />

        <div className="grid items-start gap-5 lg:grid-cols-[24rem_1fr]">
          <Card className="gap-5">
            <CardHeader>
              <CardTitle className="text-base">Invite a user</CardTitle>
              <CardDescription>
                New users sign in with the temporary password. Existing Organization users keep theirs.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="grid gap-5">
                <Field>
                  <FieldLabel className="text-sm font-medium" htmlFor="human-agent-name">
                    Full name
                  </FieldLabel>
                  <Input
                    id="human-agent-name"
                    autoComplete="name"
                    placeholder="Amara Okafor"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel className="text-sm font-medium" htmlFor="human-agent-email">
                    Work email
                  </FieldLabel>
                  <Input
                    id="human-agent-email"
                    autoComplete="email"
                    placeholder="amara@yourcompany.com"
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <FieldDescription>Doubles as their sign-in username.</FieldDescription>
                </Field>
                <Field data-invalid={passwordTooShort || undefined}>
                  <FieldLabel className="text-sm font-medium" htmlFor="human-agent-password">
                    Temporary password
                  </FieldLabel>
                  <Input
                    id="human-agent-password"
                    aria-invalid={passwordTooShort}
                    autoComplete="new-password"
                    minLength={8}
                    placeholder="At least 8 characters"
                    required
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  {passwordTooShort ? (
                    <FieldError>Use at least 8 characters.</FieldError>
                  ) : (
                    <FieldDescription>
                      For a new user, share it securely and ask them to change it. Existing users keep their password.
                    </FieldDescription>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="workspace-role">Workspace role</FieldLabel>
                  <select id="workspace-role" className="h-9 rounded-md border bg-background px-3" value={role} onChange={(event) => setRole(event.target.value as "ADMIN" | "HUMAN_AGENT")}>
                    <option value="HUMAN_AGENT">Human Agent</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </Field>
              </CardContent>
              <CardFooter className="mt-5 border-t pt-5">
                <Button
                  className="w-full"
                  type="submit"
                  disabled={createHumanAgent.isPending || password.length < 8}
                >
                  <UserPlusIcon className="size-4" />
                  {createHumanAgent.isPending ? "Creating…" : "Add to Workspace"}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card className="gap-5">
            <CardHeader>
              <CardTitle className="text-base">Team</CardTitle>
              <CardDescription>
                {isEmpty
                  ? "People with access to this Workspace."
                  : `${humanAgents.length} Workspace member${humanAgents.length === 1 ? "" : "s"}.`}
              </CardDescription>
              <CardAction>
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
                emptyDescription="Add a member with the form on the left."
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
                        <Badge variant="secondary">{humanAgent.role === "ADMIN" ? "Admin" : "Human Agent"}</Badge>
                        {humanAgent.isOrganizationAdmin ? <Badge variant="secondary">Organization Admin</Badge> : null}
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
                      <select aria-label={`Role for ${humanAgent.name}`} className="rounded-md border bg-background p-1 text-xs" value={humanAgent.role} disabled={manage.isPending} onChange={(event) => manage.mutate({ id: humanAgent.id, role: event.target.value as "ADMIN" | "HUMAN_AGENT" })}>
                        <option value="HUMAN_AGENT">Human Agent</option><option value="ADMIN">Admin</option>
                      </select>
                      {currentUser?.isOrganizationAdmin ? <Button size="sm" variant="outline" disabled={manage.isPending} onClick={() => manage.mutate({ id: humanAgent.id, organizationAdmin: !humanAgent.isOrganizationAdmin })}>{humanAgent.isOrganizationAdmin ? "Revoke Org Admin" : "Make Org Admin"}</Button> : null}
                      <Button size="sm" variant="outline" disabled={manage.isPending} onClick={() => manage.mutate({ id: humanAgent.id, remove: true })}>Remove</Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>
    </PlatformAppShell>
  );
};

export default UsersView;
