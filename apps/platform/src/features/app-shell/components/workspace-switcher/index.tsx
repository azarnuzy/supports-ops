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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { meQueryOptions } from "../../../auth";
import {
  useActiveWorkspaceId,
  useCreateWorkspaceMutation,
  useSwitchWorkspace,
  workspacesQueryOptions,
} from "../../../workspaces";

const createWorkspaceValue = "__create__";

export function WorkspaceSwitcher() {
  const user = useQuery(meQueryOptions);
  const workspaces = useQuery({
    ...workspacesQueryOptions,
    enabled: !!user.data,
  });
  const activeWorkspaceId = useActiveWorkspaceId();
  const createWorkspaceMutation = useCreateWorkspaceMutation();
  const switchWorkspace = useSwitchWorkspace();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");

  if (!user.data || !workspaces.data) return null;
  const activeWorkspaceName = workspaces.data.find(
    (workspace) => workspace.id === activeWorkspaceId,
  )?.name;

  function handleValueChange(value: string) {
    if (value === createWorkspaceValue) {
      setDialogOpen(true);
      return;
    }

    if (value !== activeWorkspaceId) void switchWorkspace(value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    createWorkspaceMutation.mutate(trimmed);
  }

  return (
    <>
      {workspaces.data.length < 2 && !user.data.isOrganizationAdmin ? (
        <div
          className="flex h-9 min-w-0 items-center rounded-md bg-muted px-2 text-sm font-medium group-data-[collapsible=icon]:hidden"
          title={workspaces.data[0]?.name}
        >
          <span className="truncate">{workspaces.data[0]?.name}</span>
        </div>
      ) : (
        <Select value={activeWorkspaceId ?? undefined} onValueChange={handleValueChange}>
          <SelectTrigger
            aria-label="Workspace"
            title={activeWorkspaceName}
            className="h-9 w-full min-w-0 border-0 bg-muted px-2 text-sm font-medium shadow-none hover:bg-accent focus-visible:ring-2 group-data-[collapsible=icon]:hidden"
            size="sm"
          >
            <SelectValue className="min-w-0 flex-1 overflow-hidden">
              <span className="block truncate">{activeWorkspaceName}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            {workspaces.data.map((workspace) => (
              <SelectItem key={workspace.id} className="text-xs font-medium" value={workspace.id}>
                {workspace.name}
              </SelectItem>
            ))}
            {user.data.isOrganizationAdmin ? (
              <SelectItem className="text-xs font-medium" value={createWorkspaceValue}>
                <PlusIcon className="size-3.5" />
                Create Workspace
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form className="grid gap-5" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Create Workspace</DialogTitle>
              <DialogDescription>
                Starts with its own AI Agent, Web Widget, and Ticket Categories, isolated from your
                other Workspaces. No new Trial Grant — it shares your Organization's Credits.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
              <Input
                id="workspace-name"
                placeholder="e.g. Acme Support"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!name.trim() || createWorkspaceMutation.isPending} type="submit">
                {createWorkspaceMutation.isPending ? "Creating..." : "Create Workspace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
