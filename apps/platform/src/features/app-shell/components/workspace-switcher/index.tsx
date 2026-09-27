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
  switchToWorkspace,
  useActiveWorkspaceId,
  useCreateWorkspaceMutation,
  workspacesQueryOptions,
} from "../../../workspaces";

const createWorkspaceValue = "__create__";

export function WorkspaceSwitcher() {
  const user = useQuery(meQueryOptions);
  const workspaces = useQuery({
    ...workspacesQueryOptions,
    enabled: !!user.data?.isOrganizationAdmin,
  });
  const activeWorkspaceId = useActiveWorkspaceId();
  const createWorkspaceMutation = useCreateWorkspaceMutation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");

  if (!user.data?.isOrganizationAdmin || !workspaces.data) return null;

  function handleValueChange(value: string) {
    if (value === createWorkspaceValue) {
      setDialogOpen(true);
      return;
    }

    if (value !== activeWorkspaceId) switchToWorkspace(value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    createWorkspaceMutation.mutate(trimmed);
  }

  return (
    <>
      <Select value={activeWorkspaceId ?? undefined} onValueChange={handleValueChange}>
        <SelectTrigger
          aria-label="Workspace"
          className="h-8 max-w-[10rem] rounded-md border-border/70 bg-background/80 px-2 text-xs font-semibold text-foreground shadow-none hover:bg-accent focus-visible:ring-2"
          size="sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {workspaces.data.map((workspace) => (
            <SelectItem key={workspace.id} className="text-xs font-medium" value={workspace.id}>
              {workspace.name}
            </SelectItem>
          ))}
          <SelectItem className="text-xs font-medium" value={createWorkspaceValue}>
            <PlusIcon className="size-3.5" />
            Create Workspace
          </SelectItem>
        </SelectContent>
      </Select>
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
