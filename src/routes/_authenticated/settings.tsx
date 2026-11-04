import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, updateProfile } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useOffline } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [
    { title: "Settings — My Cycle AI" },
    { name: "description", content: "Manage your name, WhatsApp number and cycle preferences." },
    { property: "og:title", content: "Settings — My Cycle AI" },
    { property: "og:description", content: "Your personal cycle tracking preferences and linked WhatsApp number." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SettingsPage,
});

function SettingsPage() {
  const fetchProfile = useServerFn(getProfile);
  const save = useServerFn(updateProfile);
  const qc = useQueryClient();
  const { t } = useT();
  const { owner, online } = useOffline();
  const { data, isLoading } = useQuery({ queryKey: ["profile", owner], queryFn: () => fetchProfile(), enabled: online && !!owner });

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
    if (!online) return toast.error(t("Connect to save profile changes."));
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
      toast.success(t("Profile updated"));
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message ?? t("Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("Loading…")}</p>;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">{t("Settings")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Update your profile and the WhatsApp number the bot recognizes.")}
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border bg-card p-6">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("Display name")}</Label>
          <Input id="name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">{t("WhatsApp number")}</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+1 555 123 4567"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("Include country code. Incoming WhatsApp messages from this number will be linked to your account.")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="avg">{t("Avg cycle length (days)")}</Label>
            <Input id="avg" type="number" min={20} max={45} value={avg} onChange={(e) => setAvg(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plen">{t("Period length (days)")}</Label>
            <Input id="plen" type="number" min={2} max={10} value={periodLen} onChange={(e) => setPeriodLen(Number(e.target.value))} />
          </div>
        </div>
        <Button type="submit" disabled={!online || saving} className="w-full">{t(saving ? "Saving…" : "Save changes")}</Button>
      </form>
    </div>
  );
}
