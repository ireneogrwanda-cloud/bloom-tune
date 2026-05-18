import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { completeOnboarding } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Set up your profile — Mira" }] }),
  component: Onboarding,
});

function Onboarding() {
  const nav = useNavigate();
  const submit = useServerFn(completeOnboarding);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [avg, setAvg] = useState(28);
  const [periodLen, setPeriodLen] = useState(5);
  const [lastPeriod, setLastPeriod] = useState(new Date().toISOString().slice(0, 10));
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) return toast.error("Please acknowledge the disclaimer.");
    setLoading(true);
    try {
      await submit({
        data: {
          displayName,
          whatsappNumber: phone,
          avgCycleLength: avg,
          periodLength: periodLen,
          lastPeriodStart: lastPeriod,
          disclaimerAccepted: true,
        },
      });
      toast.success("All set!");
      nav({ to: "/dashboard" });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">Set up your profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        We'll use this to predict your fertile window and link your WhatsApp messages to your account.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border bg-card p-6">
        <div className="space-y-1.5">
          <Label htmlFor="name">Display name</Label>
          <Input id="name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">WhatsApp number</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+1 555 123 4567"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Include country code. This is how the bot recognizes you.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="avg">Avg cycle length (days)</Label>
            <Input id="avg" type="number" min={20} max={45} value={avg} onChange={(e) => setAvg(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plen">Period length (days)</Label>
            <Input id="plen" type="number" min={2} max={10} value={periodLen} onChange={(e) => setPeriodLen(Number(e.target.value))} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lp">First day of your last period</Label>
          <Input id="lp" type="date" required value={lastPeriod} onChange={(e) => setLastPeriod(e.target.value)} />
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
          <span>I understand Mira is <strong>not medical advice</strong> and <strong>not a contraceptive method</strong>.</span>
        </label>

        <Button type="submit" disabled={loading} className="w-full">{loading ? "Saving…" : "Finish setup"}</Button>
      </form>
    </div>
  );
}
