import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toast } from "@repo/ui/components/sonner";
import { AuthLayout } from "@repo/layouts/auth-layout";
import { Link, getRouteApi } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useResetPasswordMutation } from "../../auth.hooks";

const route = getRouteApi("/reset-password");

/** Better Auth redirects here with `token` for a valid link and `error` for an expired or used one. */
const ResetPasswordView = () => {
  const { email, token } = route.useSearch();
  const [password, setPassword] = useState("");
  const reset = useResetPasswordMutation();

  if (!token || !email)
    return (
      <AuthLayout
        title="This link has expired or was already used"
        subtitle="Request a new password reset link."
        topRight={<Link to="/login">Login</Link>}
      >
        <Button asChild className="w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthLayout>
    );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset.mutate(
      { email, newPassword: password, token },
      { onError: (error) => toast.error(error.message) },
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Signing in again on every device is required.">
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button className="w-full" type="submit" disabled={reset.isPending}>
          {reset.isPending ? "Please wait..." : "Reset password"}
        </Button>
      </form>
    </AuthLayout>
  );
};
export default ResetPasswordView;
