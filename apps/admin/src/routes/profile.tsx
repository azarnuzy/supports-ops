import { useTranslation } from "@repo/ui/i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { AdminAppShell } from "../modules/app-shell/app-shell";
import { AdminForbiddenState } from "../modules/app-shell/forbidden-state";
import { meQueryOptions, useUpdateProfileMutation } from "../modules/auth/hooks/use-auth";
import { UnauthorizedError } from "../modules/auth/services";

export const Route = createFileRoute("/profile")({
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(meQueryOptions);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw redirect({ to: "/login" });
      }

      throw error;
    }
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { t } = useTranslation();
  const user = useQuery(meQueryOptions);
  const updateProfileMutation = useUpdateProfileMutation();
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const validationError = useMemo(() => validateProfile(name, image, t), [name, image, t]);
  const currentUser = user.data;

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name);
      setImage(currentUser.image ?? "");
    }
  }, [currentUser]);

  if (!currentUser) {
    return null;
  }

  if (!isAdminRole(currentUser.role)) {
    return <AdminForbiddenState />;
  }

  const normalizedImage = image.trim() || null;
  const isDirty = name !== currentUser.name || normalizedImage !== (currentUser.image ?? null);
  const resetName = currentUser.name;
  const resetImage = currentUser.image ?? "";

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
          const message = error instanceof Error ? error.message : t("profile.form.fallbackError");
          toast.error(message);
        },
        onSuccess: () => {
          toast.success(t("profile.form.saved"));
        },
      },
    );
  }

  function handleReset() {
    setName(resetName);
    setImage(resetImage);
  }

  return (
    <AdminAppShell>
      <section className="grid gap-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">{t("profile.eyebrow")}</p>
          <h1 className="text-3xl font-semibold text-balance">{t("profile.title")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("profile.description")}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <Card>
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle>{t("profile.form.title")}</CardTitle>
                <CardDescription>{t("profile.form.description")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <Field>
                  <FieldLabel htmlFor="admin-profile-name">{t("profile.form.name")}</FieldLabel>
                  <Input
                    id="admin-profile-name"
                    autoComplete="name"
                    value={name}
                    aria-invalid={Boolean(validationError)}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <FieldDescription>{t("profile.form.nameDescription")}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="admin-profile-image">{t("profile.form.image")}</FieldLabel>
                  <Input
                    id="admin-profile-image"
                    inputMode="url"
                    placeholder="https://example.com/avatar.png"
                    value={image}
                    aria-invalid={Boolean(validationError)}
                    onChange={(event) => setImage(event.target.value)}
                  />
                  <FieldDescription>{t("profile.form.imageDescription")}</FieldDescription>
                </Field>
                <FieldError>{validationError}</FieldError>
              </CardContent>
              <CardFooter className="mt-6 gap-3">
                <Button
                  type="submit"
                  disabled={!isDirty || Boolean(validationError) || updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending
                    ? t("profile.form.saving")
                    : t("profile.form.save")}
                </Button>
                <Button type="button" variant="outline" disabled={!isDirty} onClick={handleReset}>
                  {t("profile.form.cancel")}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("profile.preview.title")}</CardTitle>
              <CardDescription>{t("profile.preview.description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-4">
              <Avatar className="size-20 rounded-xl">
                {normalizedImage ? (
                  <AvatarImage src={normalizedImage} alt={`${name || currentUser.name} avatar`} />
                ) : null}
                <AvatarFallback className="rounded-xl text-lg">
                  {getInitials(name || currentUser.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 gap-1">
                <p className="text-lg font-semibold">{name || currentUser.name}</p>
                <p className="text-sm text-muted-foreground">{currentUser.email}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </AdminAppShell>
  );
}

function validateProfile(name: string, image: string, t: (key: string) => string) {
  const trimmedName = name.trim();
  const trimmedImage = image.trim();

  if (!trimmedName) {
    return t("profile.form.nameRequired");
  }

  if (trimmedName.length > 100) {
    return t("profile.form.nameTooLong");
  }

  if (trimmedImage) {
    try {
      const url = new URL(trimmedImage);

      if (!["http:", "https:"].includes(url.protocol)) {
        return t("profile.form.imageInvalid");
      }
    } catch {
      return t("profile.form.imageInvalid");
    }
  }

  return null;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function isAdminRole(role: string | null | undefined) {
  return role?.split(",").includes("admin") ?? false;
}
