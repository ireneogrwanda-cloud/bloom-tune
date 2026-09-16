import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDashboard, startNewCycle } from "@/lib/profile.functions";
import { logTemperatureViaBot } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { predictCycle, isoDate, type TempPoint } from "@/lib/fertility";
import { CycleChart } from "@/components/cycle-chart";
import { CycleCalendar } from "@/components/cycle-calendar";
import { RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your cycle calendar — My Cycle AI" },
      { name: "description", content: "Your monthly cycle calendar with fertile and infertile days, and your daily temperature log." },
      { property: "og:title", content: "Your cycle calendar — My Cycle AI" },
      { property: "og:description", content: "See fertile and infertile days at a glance and log your morning temperature." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const fetchDash = useServerFn(getDashboard);
  const logViaBot = useServerFn(logTemperatureViaBot);
  const newCycle = useServerFn(startNewCycle);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDash() });

  const [temp, setTemp] = useState("");
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  // "Not yet" only hides the question for today — it comes back each day until
  // bleeding actually starts.
  const todayIso = isoDate(new Date());
  const [bleedDismissed, setBleedDismissed] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem("bleed_asked_on"),
  );
  const bleedAsked = bleedDismissed === todayIso;
  function setBleedAsked(v: boolean) {
    if (!v) return;
    window.localStorage.setItem("bleed_asked_on", todayIso);
    setBleedDismissed(todayIso);
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return <p>Failed to load.</p>;

  if (!data.profile?.whatsapp_number) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center">
        <h2 className="text-xl font-semibold">Finish setting up</h2>
        <p className="mt-2 text-muted-foreground">Add your WhatsApp number and cycle info to get started.</p>
        <Button asChild className="mt-4"><Link to="/onboarding">Continue setup</Link></Button>
      </div>
    );
  }

  const profile = data.profile;
  const activeCycle = data.activeCycle;

  const cycleStart = activeCycle ? new Date(activeCycle.started_on) : new Date();
  const rawTemps: TempPoint[] = data.activeLogs.map((l: any) => ({
    day: Math.floor((new Date(l.logged_for).getTime() - cycleStart.getTime()) / 86400000) + 1,
    temp: Number(l.temp_celsius),
    date: l.logged_for,
  }));

  const stats = activeCycle
    ? predictCycle({
        cycleStart,
        today: new Date(),
        avgCycleLength: profile.avg_cycle_length,
        periodLength: profile.period_length,
        temps: rawTemps,
      })
    : null;

  function openDay(iso: string) {
    const existing = data!.activeLogs.find((l: any) => l.logged_for === iso);
    setTemp(existing ? Number(existing.temp_celsius).toFixed(2) : "");
    setPickedDate(iso);
  }

  async function saveTemp(e: React.FormEvent) {
    e.preventDefault();
    const t = parseFloat(temp);
    if (!isFinite(t) || t < 35 || t > 38) return toast.error("Enter a temperature between 35.00 and 38.00°C");
    try {
      const res = await logViaBot({ data: { loggedFor: pickedDate!, tempCelsius: Math.round(t * 100) / 100 } });
      toast.success(res?.note ? "Logged — note sent to your chat" : "Logged");
      setPickedDate(null);
      setTemp("");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["chat"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function onNewCycle(opts?: { skipConfirm?: boolean }) {
    if (!opts?.skipConfirm && !confirm("Start a new cycle today? Your current cycle will be closed.")) return;
    try {
      await newCycle({ data: { startedOn: isoDate(new Date()) } });
      toast.success("New cycle started");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hi {profile.display_name?.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">
            WhatsApp: <span className="font-mono">+{profile.whatsapp_number}</span> · Avg cycle {profile.avg_cycle_length}d
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onNewCycle()}>
          <RotateCcw className="mr-1 h-4 w-4" /> New cycle
        </Button>
      </div>

      {stats && stats.cycleDay >= stats.predictedCycleLength + 1 && !bleedAsked && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
          <h2 className="font-semibold">Has your period started?</h2>
          <p className="mt-1 text-sm">
            You're on day {stats.cycleDay} — your period is expected around now. Are you bleeding today?
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => onNewCycle({ skipConfirm: true })}>Yes, I'm bleeding</Button>
            <Button size="sm" variant="outline" onClick={() => setBleedAsked(true)}>Not yet</Button>
          </div>
        </section>
      )}

      <CycleCalendar
        profile={profile}
        activeCycle={activeCycle}
        activeLogs={data.activeLogs}
        onSelectDate={openDay}
      />

      {stats && activeCycle && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard label="Cycle day" value={String(stats.cycleDay)} sub={`Started ${activeCycle.started_on}`} />
          <StatCard
            label="Status"
            value={stats.status === "fertile" || stats.status === "ovulation" ? "Fertile 🌱" : stats.status === "early-cycle" ? "Early cycle 🩸" : "Low"}
            sub={stats.message}
          />
          <StatCard
            label="Ovulation"
            value={
              stats.ovulationConfirmed
                ? `Day ${stats.estimatedOvulationDay}`
                : stats.ovulationDayMin === stats.ovulationDayMax
                  ? `~Day ${stats.estimatedOvulationDay}`
                  : `Days ${stats.ovulationDayMin}–${stats.ovulationDayMax}`
            }
            sub={stats.ovulationConfirmed ? "Confirmed by BBT (3-over-6)" : `Estimated range · fertile window days ${stats.fertileStartDay}–${stats.fertileEndDay}`}
          />
        </div>
      )}

      <CycleChart profile={profile} activeCycle={activeCycle} activeLogs={data.activeLogs} />

      {/* Monthly summary — simple at-a-glance stats for the current cycle */}
      {(() => {
        const usable = data.activeLogs.filter((l: any) => !l.excluded);
        const totalLoggedDays = usable.length;
        const avgTemp =
          totalLoggedDays > 0
            ? (usable.reduce((s: number, l: any) => s + Number(l.temp_celsius), 0) / totalLoggedDays).toFixed(2)
            : "—";
        const mostFertileDay = stats
          ? stats.ovulationConfirmed
            ? `Day ${stats.estimatedOvulationDay}`
            : stats.ovulationDayMin === stats.ovulationDayMax
              ? `~Day ${stats.estimatedOvulationDay}`
              : `Days ${stats.ovulationDayMin}–${stats.ovulationDayMax}`
          : "—";
        return (
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-semibold">Monthly summary</h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-muted/40 px-3 py-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg. temperature</p>
                <p className="mt-1 text-xl font-bold">{avgTemp}{avgTemp !== "—" ? "°C" : ""}</p>
              </div>
              <div className="rounded-xl bg-muted/40 px-3 py-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Most fertile day</p>
                <p className="mt-1 text-xl font-bold">{mostFertileDay}</p>
              </div>
              <div className="rounded-xl bg-muted/40 px-3 py-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Days logged</p>
                <p className="mt-1 text-xl font-bold">{totalLoggedDays}</p>
              </div>
            </div>
          </section>
        );
      })()}

      <Dialog open={!!pickedDate} onOpenChange={(o) => !o && setPickedDate(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Morning temperature</DialogTitle>
            <DialogDescription>
              {pickedDate ? new Date(pickedDate).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveTemp} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="t">Temperature (°C)</Label>
              <Input
                id="t"
                type="number"
                step="0.01"
                min="35"
                max="38"
                autoFocus
                placeholder="36.72"
                value={temp}
                onChange={(e) => setTemp(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">Save</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-bold leading-tight sm:text-lg">{value}</p>
      {sub && <p className="mt-1 text-[10px] leading-snug text-muted-foreground line-clamp-3">{sub}</p>}
    </div>
  );
}
