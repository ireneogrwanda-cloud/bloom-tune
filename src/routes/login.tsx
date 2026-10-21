import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { signInWithWhatsApp } from "@/lib/otp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in with WhatsApp — My Cycle AI" },
      { name: "description", content: "Sign in to My Cycle AI with your WhatsApp number and a one-time code." },
      { property: "og:title", content: "Sign in with WhatsApp — My Cycle AI" },
      { property: "og:description", content: "No password needed — My Cycle AI sends a one-time code to your WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  return (
    <AuthShell title="Sign in with WhatsApp" subtitle="We'll message you a one-time code — no password needed">
      <WhatsAppOtpForm />
    </AuthShell>
  );
}

export function WhatsAppOtpForm() {
  const nav = useNavigate();
  const sendCode = useServerFn(requestWhatsAppCode);
  const checkCode = useServerFn(verifyWhatsAppCode);
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\+?\d[\d\s\-()]{6,19}$/.test(phone)) {
      return toast.error("Enter a valid WhatsApp number including country code");
    }
    setLoading(true);
    try {
      const res = await sendCode({ data: { phone } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Code sent to your WhatsApp");
      setStep("code");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send the code");
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { tokenHash, isNew } = await checkCode({ data: { phone, code } });
      const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
      if (error) throw new Error(error.message);
      toast.success(isNew ? "Welcome to My Cycle AI!" : "Welcome back");
      nav({ to: isNew ? "/onboarding" : "/" });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not sign you in");
    } finally {
      setLoading(false);
    }
  }

  if (step === "phone") {
    return (
      <form onSubmit={onSendCode} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="phone">WhatsApp number</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+1 555 123 4567"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Include your country code. This is also how the bot knows you.</p>
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Sending code…" : "Send me a code"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onVerify} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="code">6-digit code</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        <p className="text-xs text-muted-foreground">Sent to {phone} on WhatsApp. It expires in 10 minutes.</p>
      </div>
      <Button type="submit" disabled={loading || code.length !== 6} className="w-full">
        {loading ? "Checking…" : "Continue"}
      </Button>
      <button
        type="button"
        className="w-full text-center text-sm text-muted-foreground hover:underline"
        onClick={() => {
          setStep("phone");
          setCode("");
        }}
      >
        Use a different number
      </button>
    </form>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 to-background">
      <div className="container mx-auto flex max-w-md flex-col items-center px-6 py-10">
        <Link to="/" className="mb-8 flex items-center gap-2 font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white text-sm">M</span>
          My Cycle AI
        </Link>
        <div className="w-full rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">This bot helps you track fertility patterns.</p>
      </div>
    </div>
  );
}
