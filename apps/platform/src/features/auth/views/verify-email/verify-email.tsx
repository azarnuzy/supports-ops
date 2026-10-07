import { AuthLayout } from "@repo/layouts/auth-layout";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@repo/ui/components/input";
import { meQueryOptions } from "../../auth.hooks";
import { ResendVerification } from "../../components/resend-verification";

/** Better Auth lands here after the link is followed: signed in on success, no session if the link was expired or already used. */
const VerifyEmailView = () => {
  const me = useQuery(meQueryOptions);
  const [email, setEmail] = useState("");

  if (me.isPending) return null;
  if (me.data) return <Navigate to="/" />;

  return (
    <AuthLayout
      title="This link has expired or was already used"
      subtitle="Enter your email and we will send you a new verification link."
      topRight={<Link to="/login">Login</Link>}
    >
      <div className="grid gap-4">
        <Input
          type="email"
          placeholder="name@company.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {email ? <ResendVerification email={email} /> : null}
      </div>
    </AuthLayout>
  );
};
export default VerifyEmailView;
