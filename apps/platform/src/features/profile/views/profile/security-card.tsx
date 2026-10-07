import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { type FormEvent, useState } from "react";
import { useChangePasswordMutation } from "../../../auth";

export function SecurityCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const mutation = useChangePasswordMutation();
  const tooShortOrLong = newPassword.length < 8 || newPassword.length > 128;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(
      { currentPassword, newPassword },
      {
        onError: (error) => toast.error(error.message),
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
          toast.success("Password changed. Other sessions were signed out.");
        },
      },
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Changing your password signs you out everywhere except this browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Field>
            <FieldLabel htmlFor="current-password">Current password</FieldLabel>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <FieldDescription>8–128 characters.</FieldDescription>
          </Field>
        </CardContent>
        <CardFooter className="mt-6">
          <Button type="submit" disabled={!currentPassword || tooShortOrLong || mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Change password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
