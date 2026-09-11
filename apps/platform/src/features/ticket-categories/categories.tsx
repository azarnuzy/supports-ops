import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toast } from "@repo/ui/components/sonner";
import { Textarea } from "@repo/ui/components/textarea";
import type { TicketCategoryOption } from "@repo/api-client";
import { PlusIcon, TagsIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { PlatformAppShell } from "../app-shell";
import { SettingsHeader } from "../settings/components/settings-header";
import {
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useTicketCategoriesQuery,
  useUpdateCategoryMutation,
} from "./hooks";

type Draft = { description: string; label: string };

const emptyDraft: Draft = { description: "", label: "" };

const TicketCategoriesView = () => {
  const categories = useTicketCategoriesQuery();
  const createCategory = useCreateCategoryMutation();
  const updateCategory = useUpdateCategoryMutation();
  const deleteCategory = useDeleteCategoryMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TicketCategoryOption | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const items = categories.data?.categories ?? [];

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft);
    setDialogOpen(true);
  }

  function openEdit(category: TicketCategoryOption) {
    setEditing(category);
    setDraft({ description: category.description, label: category.label });
    setDialogOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { description: draft.description.trim(), label: draft.label.trim() };
    const onError = (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Failed to save the category.");
    const onSuccess = () => {
      toast.success(editing ? "Category updated." : "Category added.");
      setDialogOpen(false);
      setEditing(null);
      setDraft(emptyDraft);
    };

    if (editing) updateCategory.mutate({ id: editing.id, input }, { onError, onSuccess });
    else createCategory.mutate(input, { onError, onSuccess });
  }

  function handleDelete(category: TicketCategoryOption) {
    deleteCategory.mutate(category.id, {
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Failed to delete the category."),
      onSuccess: () => toast.success("Category deleted. Its tickets moved to the fallback."),
    });
  }

  return (
    <PlatformAppShell>
      <section className="grid max-w-3xl gap-6">
        <SettingsHeader
          eyebrow="Workspace"
          title="Ticket categories"
          description="Every conversation is sorted into one of these automatically. The description is what the AI reads to decide, so write it the way you would explain it to a new teammate."
          action={
            <Button onClick={openCreate}>
              <PlusIcon className="size-4" />
              Add category
            </Button>
          }
        />

        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {categories.isPending ? (
            <div className="grid gap-3 p-5">
              {["a", "b", "c"].map((key) => (
                <Skeleton key={key} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : null}
          {categories.isError ? (
            <div className="grid place-items-center gap-3 p-12 text-center">
              <p className="text-sm text-destructive">Unable to load categories.</p>
              <Button variant="outline" onClick={() => void categories.refetch()}>
                Retry
              </Button>
            </div>
          ) : null}
          {!categories.isPending && !categories.isError && items.length === 0 ? (
            <div className="grid place-items-center gap-3 p-12 text-center">
              <div className="grid size-10 place-items-center rounded-lg bg-muted">
                <TagsIcon className="size-5 text-muted-foreground" />
              </div>
              <p className="text-base font-medium">No categories yet</p>
            </div>
          ) : null}
          {items.map((category) => (
            <div key={category.id} className="flex flex-wrap items-center gap-3 border-b p-4 last:border-b-0">
              <button
                type="button"
                className="min-w-[12rem] flex-1 cursor-pointer text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                onClick={() => openEdit(category)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{category.label}</p>
                  {category.isFallback ? <Badge variant="secondary">Fallback</Badge> : null}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {category.description}
                </p>
              </button>
              <Button
                aria-label={`Delete ${category.label}`}
                disabled={category.isFallback || deleteCategory.isPending}
                size="icon-sm"
                title={
                  category.isFallback
                    ? "The fallback category catches anything the AI is unsure about, so it cannot be removed."
                    : undefined
                }
                variant="ghost"
                onClick={() => handleDelete(category)}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Deleting a category never deletes tickets: they move to the fallback category. Renaming
          a category is safe at any time — existing tickets keep their place.
        </p>
      </section>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <form className="grid gap-5" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit category" : "Add category"}</DialogTitle>
              <DialogDescription>
                Two categories that sound alike get confused with each other, which files tickets
                in the wrong place and skews every report built on them.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="category-label">Name</FieldLabel>
              <Input
                id="category-label"
                required
                maxLength={60}
                placeholder="Shipping"
                value={draft.label}
                onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="category-description">When to use it</FieldLabel>
              <Textarea
                id="category-description"
                required
                rows={3}
                maxLength={500}
                placeholder="Delivery status, late or lost parcels, address changes, and returns in transit."
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
              />
              <FieldDescription>
                The AI reads this to sort each conversation. Be concrete about what belongs here and
                what does not.
              </FieldDescription>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createCategory.isPending || updateCategory.isPending}>
                {createCategory.isPending || updateCategory.isPending
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Add category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PlatformAppShell>
  );
};

export default TicketCategoriesView;
