import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell, WhatsAppOtpForm } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your My Cycle AI account with WhatsApp" },
      { name: "description", content: "Create an account with secure WhatsApp number verification." },
      { property: "og:title", content: "Create your My Cycle AI account with WhatsApp" },
      { property: "og:description", content: "Verify your WhatsApp number once and stay signed in on this device." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  return (
    <AuthShell title="Create your account" subtitle="Verify your WhatsApp number once, then stay signed in">
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
