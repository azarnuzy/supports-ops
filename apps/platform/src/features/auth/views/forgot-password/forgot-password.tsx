import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toast } from "@repo/ui/components/sonner";
import { AuthLayout } from "@repo/layouts/auth-layout";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useRequestPasswordResetMutation } from "../../auth.hooks";

const ForgotPasswordView = () => {
  const [email, setEmail] = useState("");
  const request = useRequestPasswordResetMutation();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    request.mutate(email.trim(), { onError: (error) => toast.error(error.message) });
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email and we will send you a link to choose a new one."
      topRight={<Link to="/login">Login</Link>}
    >
      {request.isSuccess ? (
        <p className="text-sm" role="status">
          If an account exists for that email, we've sent a link. It is valid for 1 hour.
        </p>
      ) : (
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@company.com"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button className="w-full" type="submit" disabled={request.isPending}>
            {request.isPending ? "Please wait..." : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
};
export default ForgotPasswordView;
