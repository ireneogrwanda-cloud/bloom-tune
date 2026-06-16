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
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea, CartesianGrid } from "recharts";
import { MessageCircle, ThermometerSun, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Mira" }] }),
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

  // Day classification for chart coloring:
  //  - "fertile": inside predicted/confirmed fertile window → red
  //  - "safe": confidently infertile (bleeding, or pre/post window with enough evidence) → green
  //  - "uncertain": low-confidence pre-window or unclosed post-window → red (treat as fertile)
  const preFertileConfirmed = stats ? stats.confidence !== "low" : false;
  const postFertileConfirmed = stats ? stats.fertileWindowClosed : false;
  const temps = rawTemps.map((p) => {
    let kind: "fertile" | "safe" | "uncertain" = "safe";
    if (stats) {
      if (p.day >= stats.fertileStartDay && p.day <= stats.fertileEndDay) kind = "fertile";
      else if (p.day <= profile.period_length) kind = "safe";
      else if (p.day < stats.fertileStartDay) kind = preFertileConfirmed ? "safe" : "uncertain";
      else kind = postFertileConfirmed ? "safe" : "uncertain";
    }
    return { ...p, fertile: kind === "fertile", kind };
  });

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
        <div className="rounded-2xl border bg-card p-5 lg:col-span-2">
          <h2 className="font-semibold flex items-center gap-2"><ThermometerSun className="h-4 w-4" /> Temperature this cycle</h2>
          <div className="mt-4 h-64">
            {temps.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No logs yet. Send a temperature on WhatsApp or use the form on the right.
              </div>
            ) : (
              <ResponsiveContainer>
                <LineChart data={temps} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tempStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(142 70% 40%)" />
                      <stop offset="100%" stopColor="hsl(340 82% 55%)" />
                    </linearGradient>
                    <linearGradient id="fertileFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(340 82% 55%)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="hsl(340 82% 55%)" stopOpacity={0.06} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 80%)" opacity={0.35} />
                  <XAxis dataKey="day" stroke="hsl(220 10% 45%)" tick={{ fontSize: 11 }} label={{ value: "Cycle day", position: "insideBottom", offset: -2, fill: "hsl(220 10% 45%)", fontSize: 11 }} />
                  <YAxis domain={[35.5, 37.5]} tickCount={5} stroke="hsl(220 10% 45%)" tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number, _n, item: any) => {
                      const k = item?.payload?.kind;
                      const label = k === "fertile" ? "Fertile day" : k === "uncertain" ? "Treat as fertile (low confidence)" : "Low-fertility day";
                      return [`${v}°C`, label];
                    }}
                    labelFormatter={(d) => `Cycle day ${d}`}
                    contentStyle={{ borderRadius: 12, border: "1px solid hsl(220 15% 85%)", fontSize: 12 }}
                  />
                  {stats && (
                    <ReferenceArea
                      x1={stats.fertileStartDay}
                      x2={stats.fertileEndDay}
                      fill={stats.ovulationConfirmed ? "hsl(142 70% 42% / 0.12)" : "url(#fertileFill)"}
                      stroke={stats.ovulationConfirmed ? "hsl(142 70% 35%)" : "hsl(340 82% 55%)"}
                      strokeOpacity={0.3}
                      label={{
                        value: stats.ovulationConfirmed ? "Fertile window (confirmed)" : "Predicted fertile window",
                        position: "insideTop",
                        fontSize: 11,
                        fill: stats.ovulationConfirmed ? "hsl(142 60% 30%)" : "hsl(340 60% 40%)",
                      }}
                    />
                  )}
                  {stats && (
                    <ReferenceArea
                      x1={stats.ovulationDayMin}
                      x2={stats.ovulationDayMax}
                      fill={stats.ovulationConfirmed ? "hsl(280 70% 50% / 0.35)" : "hsl(280 70% 50% / 0.18)"}
                      stroke="hsl(280 70% 45%)"
                      strokeOpacity={0.5}
                      strokeDasharray="3 3"
                      label={{
                        value: stats.ovulationConfirmed ? "Ovulation" : "Ovulation range",
                        position: "insideBottom",
                        fontSize: 10,
                        fill: "hsl(280 60% 35%)",
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="temp"
                    stroke="url(#tempStroke)"
                    strokeWidth={2.5}
                    dot={(props: any) => {
                      const { cx, cy, payload, index } = props;
                      const kind = payload?.kind;
                      const fill = kind === "safe" ? "#16a34a" : "#dc2626";
                      return (
                        <circle key={index} cx={cx} cy={cy} r={5} fill={fill} stroke="white" strokeWidth={2} />
                      );
                    }}
                    activeDot={{ r: 7, strokeWidth: 2, stroke: "white" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          {temps.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#dc2626" }} /> Fertile day</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#16a34a" }} /> Low-fertility day</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: "hsl(340 82% 55% / 0.2)", border: "1px solid hsl(340 82% 55% / 0.4)" }} /> Predicted fertile window</span>
            </div>
          )}
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
