import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toast } from "@repo/ui/components/sonner";
import { AuthLayout } from "@repo/layouts/auth-layout";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import {
  authProvidersQueryOptions,
  invitationQueryOptions,
  useAcceptInvitationMutation,
  useGoogleMutation,
} from "../../auth.hooks";
import { InvitationUnavailableApiError } from "@repo/api-client";

const route = getRouteApi("/accept-invitation");

const AcceptInvitationView = () => {
  const { token } = route.useSearch();
  const invitation = useQuery(invitationQueryOptions(token));
  const accept = useAcceptInvitationMutation();
  const google = useGoogleMutation();
  const providers = useQuery(authProvidersQueryOptions);
  const params = new URLSearchParams(window.location.search);
  const [errorCode, invitedEmail] = params.get("error")?.split(":") ?? [];
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  if (invitation.isPending) return null;

  if (invitation.isError || !invitation.data) {
    const unavailable = !token || invitation.error instanceof InvitationUnavailableApiError;
    return (
      <AuthLayout
        title={unavailable ? "This Invitation is no longer valid" : "Could not load the Invitation"}
        subtitle={unavailable ? "Ask your Admin to resend it." : "Please try again in a moment."}
      >
        {null}
      </AuthLayout>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    accept.mutate(
      { token, name: name.trim(), password },
      { onError: (error) => toast.error(error.message) },
    );
  }

  const { workspaceName, invitedByName, email, role } = invitation.data;

  return (
    <AuthLayout
      title={
        params.has("invited")
          ? `You've been invited to ${workspaceName}`
          : `Join ${workspaceName}`
      }
      subtitle={`${invitedByName} invited you as ${role === "ADMIN" ? "an Admin" : "a Human Agent"}.`}
    >
      {errorCode === "invitation_email_mismatch" && (
        <p className="mb-4 text-destructive text-sm" role="alert">
          This Invitation is for {invitedEmail}. Continue with that Google account.
        </p>
      )}
      {providers.data?.google && (
        <Button
          className="mb-4 w-full"
          type="button"
          variant="outline"
          disabled={google.isPending}
          onClick={() => google.mutate(token, { onError: (e) => toast.error(e.message) })}
        >
          Continue with Google
        </Button>
      )}
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" value={email} readOnly disabled />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="Your full name"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
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
        <Button className="mt-2 w-full" type="submit" disabled={accept.isPending}>
          {accept.isPending ? "Please wait..." : "Join Workspace"}
        </Button>
      </form>
    </AuthLayout>
  );
};
export default AcceptInvitationView;
