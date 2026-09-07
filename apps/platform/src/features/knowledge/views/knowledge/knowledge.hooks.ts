import { toast } from "@repo/ui/components/sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import {
  knowledgeSourcesQueryOptions,
  useCreateManualFaqMutation,
  useDeleteKnowledgeSourceMutation,
  usePublishKnowledgeSourceMutation,
  useUpdateManualFaqMutation,
} from "../../knowledge.hooks";
import { testRetrieval } from "../../knowledge.services";
import type { KnowledgeSource, KnowledgeVisibility } from "../../knowledge.types";

export function useKnowledgeSourcesForm() {
  const knowledgeSources = useQuery(knowledgeSourcesQueryOptions);
  const createManualFaq = useCreateManualFaqMutation();
  const updateManualFaq = useUpdateManualFaqMutation();
  const publishKnowledgeSource = usePublishKnowledgeSourceMutation();
  const deleteKnowledgeSource = useDeleteKnowledgeSourceMutation();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<KnowledgeVisibility>("CUSTOMER_SAFE");

  function startEditing(knowledgeSource: KnowledgeSource) {
    setEditingId(knowledgeSource.id);
    setTitle(knowledgeSource.title);
    setContent(knowledgeSource.content ?? "");
    setVisibility(knowledgeSource.visibility);
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setContent("");
    setVisibility("CUSTOMER_SAFE");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = { content: content.trim(), title: title.trim(), visibility };

    if (editingId) {
      updateManualFaq.mutate(
        { id: editingId, input },
        {
          onError: (error) =>
            toast.error(error instanceof Error ? error.message : "Failed to save."),
          onSuccess: () => {
            toast.success("Knowledge Source saved.");
            resetForm();
          },
        },
      );
      return;
    }

    createManualFaq.mutate(input, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create."),
      onSuccess: () => {
        toast.success("Knowledge Source created as a draft.");
        resetForm();
      },
    });
  }

  function handlePublish(id: string) {
    publishKnowledgeSource.mutate(id, {
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Failed to publish."),
      onSuccess: () => toast.success("Publishing started."),
    });
  }

  function handleDelete(id: string) {
    deleteKnowledgeSource.mutate(id, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete."),
      onSuccess: () => {
        toast.success("Knowledge Source deleted.");
        if (editingId === id) resetForm();
      },
    });
  }

  const isSaving = createManualFaq.isPending || updateManualFaq.isPending;

  return {
    content,
    editingId,
    handleDelete,
    handlePublish,
    handleSubmit,
    isSaving,
    knowledgeSources,
    publishingId: publishKnowledgeSource.isPending ? publishKnowledgeSource.variables : null,
    resetForm,
    setContent,
    setTitle,
    setVisibility,
    startEditing,
    title,
    visibility,
  };
}

export function useRetrievalTestPanel() {
  const [query, setQuery] = useState("");

  const runTest = useMutation({
    mutationFn: testRetrieval,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!query.trim()) {
      return;
    }

    runTest.mutate(query.trim(), {
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Retrieval test failed."),
    });
  }

  return { handleSubmit, query, runTest, setQuery };
}
