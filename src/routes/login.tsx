import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeWhatsAppPhone } from "@/lib/otp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in with WhatsApp — My Cycle AI" },
      { name: "description", content: "Sign in securely with a WhatsApp verification code." },
      { property: "og:title", content: "Sign in with WhatsApp — My Cycle AI" },
      { property: "og:description", content: "Verify your number once and stay signed in on this device." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  return (
    <AuthShell title="Sign in with WhatsApp" subtitle="Verify your number once, then stay signed in on this device">
      <WhatsAppOtpForm />
    </AuthShell>
  );
}

export function WhatsAppOtpForm() {
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    let normalized: string;
    try {
      normalized = normalizeWhatsAppPhone(phone);
    } catch {
      toast.error("Enter a valid WhatsApp number including country code");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalized,
        options: { channel: "whatsapp" },
      });
      if (error) throw error;
      setPhone(normalized);
      setCodeSent(true);
      toast.success("Verification code sent to your WhatsApp");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send the WhatsApp code");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return toast.error("Enter the 6-digit code from WhatsApp");
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
      if (error) throw error;
      // A verified phone can reclaim only its own legacy synthetic-email data.
      const { error: claimError } = await supabase.rpc("claim_legacy_phone_account");
      if (claimError) throw claimError;
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("disclaimer_accepted_at")
        .maybeSingle();
      if (profileError) throw profileError;
      const needsOnboarding = !profile?.disclaimer_accepted_at;
      toast.success(needsOnboarding ? "Welcome to My Cycle AI!" : "Welcome back");
      await nav({ to: needsOnboarding ? "/onboarding" : "/" });
    } catch (e: any) {
      toast.error(e?.message ?? "That code could not be verified");
    } finally {
      setLoading(false);
    }
  }

  if (codeSent) {
    return (
      <form onSubmit={verifyCode} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="code">WhatsApp verification code</Label>
          <Input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <p className="text-xs text-muted-foreground">Sent to {phone}. The code expires shortly.</p>
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Verifying…" : "Verify and sign in"}
        </Button>
        <Button type="button" variant="ghost" disabled={loading} className="w-full" onClick={() => void requestCode()}>
          Send a new code
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="space-y-4">
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
        <p className="text-xs text-muted-foreground">
          Include your country code. A verified number protects your private cycle history.
        </p>
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Sending code…" : "Send WhatsApp code"}
      </Button>
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
