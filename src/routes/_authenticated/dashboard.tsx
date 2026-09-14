import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDashboard, logTemperature, startNewCycle } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { predictCycle, isoDate, type TempPoint } from "@/lib/fertility";
import { CycleChart } from "@/components/cycle-chart";
import { MessageCircle, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — My Cycle AI" }] }),
  component: Dashboard,
});

function Dashboard() {
  const fetchDash = useServerFn(getDashboard);
  const logTemp = useServerFn(logTemperature);
  const newCycle = useServerFn(startNewCycle);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDash() });

  const [temp, setTemp] = useState("");
  const [logDate, setLogDate] = useState(isoDate(new Date()));

  useEffect(() => {
    if (data && !data.profile?.whatsapp_number) {
      // not onboarded yet
    }
  }, [data]);

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


  async function onLog(e: React.FormEvent) {
    e.preventDefault();
    const t = parseFloat(temp);
    if (!isFinite(t) || t < 35 || t > 40) return toast.error("Enter a temperature between 35 and 40°C");
    try {
      await logTemp({ data: { loggedFor: logDate, tempCelsius: t } });
      toast.success("Logged");
      setTemp("");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function onNewCycle() {
    if (!confirm("Start a new cycle today? Your current cycle will be closed.")) return;
    try {
      await newCycle({ data: { startedOn: isoDate(new Date()) } });
      toast.success("New cycle started");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hi {profile.display_name?.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">
            WhatsApp: <span className="font-mono">+{profile.whatsapp_number}</span> · Avg cycle {profile.avg_cycle_length}d
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onNewCycle}>
          <RotateCcw className="mr-1 h-4 w-4" /> New cycle
        </Button>
      </div>

      {stats && activeCycle && (
        <div className="grid gap-4 md:grid-cols-3">
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

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CycleChart profile={profile} activeCycle={activeCycle} activeLogs={data.activeLogs} />
        </div>


        <div className="space-y-4">
          <form onSubmit={onLog} className="rounded-2xl border bg-card p-5 space-y-3">
            <h3 className="font-semibold">Log a temperature</h3>
            <div className="space-y-1.5">
              <Label htmlFor="d">Date</Label>
              <Input id="d" type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t">Temperature (°C)</Label>
              <Input id="t" type="number" step="0.01" min="35" max="40" placeholder="36.7" value={temp} onChange={(e) => setTemp(e.target.value)} />
            </div>
            <Button type="submit" className="w-full">Save</Button>
          </form>

          <div className="rounded-2xl border bg-gradient-to-br from-emerald-50 to-rose-50 p-5">
            <h3 className="font-semibold flex items-center gap-2"><MessageCircle className="h-4 w-4" /> WhatsApp setup</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Send any temperature (e.g. <code>36.7</code>) from <span className="font-mono">+{profile.whatsapp_number}</span> to our bot and you'll get an instant prediction.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Commands: <code>status</code> · <code>reset cycle</code> · <code>help</code></p>
          </div>
        </div>
      </div>

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

      <section>
        <h2 className="font-semibold mb-2">Past cycles</h2>
        <div className="rounded-2xl border bg-card divide-y">
          {data.cycles.length === 0 && <p className="p-5 text-sm text-muted-foreground">No cycles recorded yet.</p>}
          {data.cycles.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <p className="font-medium">{c.started_on} {c.ended_on ? `→ ${c.ended_on}` : "(active)"}</p>
                <p className="text-xs text-muted-foreground">
                  Status: {c.status}{c.ovulation_day ? ` · Ovulation day ${c.ovulation_day}` : ""}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${c.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{c.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{sub}</p>}
    </div>
  );
}
