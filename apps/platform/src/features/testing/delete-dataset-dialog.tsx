import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { useDeleteDatasetMutation } from "./hooks";

export function DeleteDatasetDialog({
  dataset,
  onClose,
  onDeleted,
}: {
  dataset: { id: string; name: string };
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const mutation = useDeleteDatasetMutation();
  return (
    <AlertDialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete dataset?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes “{dataset.name}” and all its cases. Evaluation run history is
            retained. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(dataset.id, {
                onError: (error) => toast.error(error.message),
                onSuccess: () => {
                  toast.success("Dataset deleted.");
                  onClose();
                  onDeleted?.();
                },
              })
            }
          >
            {mutation.isPending ? "Deleting…" : "Delete dataset"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
