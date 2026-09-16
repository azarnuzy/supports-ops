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
import { CopyIcon } from "lucide-react";
import { PlatformAppShell } from "../../../app-shell";
import { getInitials } from "../../../../lib/utils";
import { useProfileForm } from "./profile.hooks";

const ProfileView = () => {
  const {
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
  } = useProfileForm();

  if (!currentUser) {
    return null;
  }

  async function copyWorkspaceId() {
    try {
      await navigator.clipboard.writeText(currentUser.workspaceId);
      toast.success("Workspace ID copied.");
    } catch {
      toast.error("Could not copy the Workspace ID.");
    }
  }

  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Profile settings</p>
          <h1 className="text-3xl font-semibold text-balance">Edit profile</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Update the display details tied to your user account.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <Card>
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle>Edit profile</CardTitle>
                <CardDescription>
                  Name is required. Avatar image is optional and must be a public URL.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <Field>
                  <FieldLabel htmlFor="profile-name">Display name</FieldLabel>
                  <Input
                    id="profile-name"
                    autoComplete="name"
                    value={name}
                    aria-invalid={Boolean(validationError)}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <FieldDescription>
                    Use the name people should recognize in the product.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="profile-image">Avatar URL</FieldLabel>
                  <Input
                    id="profile-image"
                    inputMode="url"
                    placeholder="https://example.com/avatar.png"
                    value={image}
                    aria-invalid={Boolean(validationError)}
                    onChange={(event) => setImage(event.target.value)}
                  />
                  <FieldDescription>Leave empty to remove the avatar image.</FieldDescription>
                </Field>
                <FieldError>{validationError}</FieldError>
              </CardContent>
              <CardFooter className="mt-6 gap-3">
                <Button
                  type="submit"
                  disabled={!isDirty || Boolean(validationError) || updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? "Saving..." : "Save profile"}
                </Button>
                <Button type="button" variant="outline" disabled={!isDirty} onClick={handleReset}>
                  Cancel
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>A quick check before saving your changes.</CardDescription>
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
            <CardContent className="grid gap-2 border-t pt-5">
              <p className="text-sm font-medium">Workspace ID</p>
              <p className="text-xs text-muted-foreground">
                Use this value as EVAL_WORKSPACE_ID when running evaluations.
              </p>
              <Button
                className="h-auto w-full justify-between font-mono text-xs break-all"
                type="button"
                variant="outline"
                onClick={() => void copyWorkspaceId()}
              >
                {currentUser.workspaceId}
                <CopyIcon className="size-3.5 shrink-0" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </PlatformAppShell>
  );
};

export default ProfileView;
