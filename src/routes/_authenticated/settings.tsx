import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, updateProfile } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — My Cycle AI" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const fetchProfile = useServerFn(getProfile);
  const save = useServerFn(updateProfile);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [avg, setAvg] = useState(28);
  const [periodLen, setPeriodLen] = useState(5);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDisplayName(data.display_name ?? "");
    setPhone(data.whatsapp_number ? `+${data.whatsapp_number}` : "");
    setAvg(data.avg_cycle_length ?? 28);
    setPeriodLen(data.period_length ?? 5);
  }, [data]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await save({
        data: {
          displayName,
          whatsappNumber: phone,
          avgCycleLength: avg,
          periodLength: periodLen,
        },
      });
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Update your profile and the WhatsApp number the bot recognizes.
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
          <p className="text-xs text-muted-foreground">
            Include country code. Incoming WhatsApp messages from this number will be linked to your account.
          </p>
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
        <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving…" : "Save changes"}</Button>
      </form>
    </div>
  );
}
