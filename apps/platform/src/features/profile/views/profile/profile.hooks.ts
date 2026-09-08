import { toast } from "@repo/ui/components/sonner";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { meQueryOptions, useUpdateProfileMutation } from "../../../auth";
import { validateProfile } from "./profile.services";

export function useProfileForm() {
  const user = useQuery(meQueryOptions);
  const updateProfileMutation = useUpdateProfileMutation();
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const validationError = useMemo(() => validateProfile(name, image), [name, image]);
  const currentUser = user.data;

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name);
      setImage(currentUser.image ?? "");
    }
  }, [currentUser]);

  const normalizedImage = image.trim() || null;
  const isDirty =
    !!currentUser && (name !== currentUser.name || normalizedImage !== (currentUser.image ?? null));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (validationError) {
      return;
    }

    updateProfileMutation.mutate(
      {
        image: normalizedImage,
        name: name.trim(),
      },
      {
        onError: (error) => {
          const message = error instanceof Error ? error.message : "Failed to save profile.";
          toast.error(message);
        },
        onSuccess: () => {
          toast.success("Profile saved.");
        },
      },
    );
  }

  function handleReset() {
    if (!currentUser) {
      return;
    }

    setName(currentUser.name);
    setImage(currentUser.image ?? "");
  }

  return {
    currentUser,
    handleReset,
    handleSubmit,
    image,
    isDirty,
    name,
    normalizedImage,
    setImage,
    setName,
    updateProfileMutation,
    validationError,
  };
}
