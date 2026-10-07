import { AuthLayout } from "@repo/layouts/auth-layout";
import { getRouteApi } from "@tanstack/react-router";
import { ResendVerification } from "../../components/resend-verification";

const route = getRouteApi("/check-inbox");

const CheckInboxView = () => {
  const { email } = route.useSearch();

  return (
    <AuthLayout
      title="Check your inbox"
      subtitle={`We sent a verification link to ${email}. It is valid for 24 hours.`}
    >
      <ResendVerification email={email} justSent />
    </AuthLayout>
  );
};
export default CheckInboxView;
