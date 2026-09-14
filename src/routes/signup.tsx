import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell, WhatsAppOtpForm } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your My Cycle AI account with WhatsApp" },
      { name: "description", content: "Create a My Cycle AI account using just your WhatsApp number and a one-time code." },
      { property: "og:title", content: "Create your My Cycle AI account with WhatsApp" },
      { property: "og:description", content: "Start tracking your cycle — sign up with your WhatsApp number." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  return (
    <AuthShell title="Create your account" subtitle="Just your WhatsApp number — we'll send a one-time code">
      <WhatsAppOtpForm />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-rose-600 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
