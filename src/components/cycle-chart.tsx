import { predictCycle, type TempPoint } from "@/lib/fertility";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine, CartesianGrid } from "recharts";
import { ThermometerSun } from "lucide-react";

export type CycleProfile = {
  avg_cycle_length: number;
  period_length: number;
};

export type CycleChartProps = {
  profile: CycleProfile;
  activeCycle: { started_on: string } | null;
  activeLogs: Array<{ logged_for: string; temp_celsius: number | string; excluded?: boolean }>;
  heightClass?: string;
};

/**
 * Shared cycle temperature chart used by the dashboard and the chat home page.
 * Renders nothing meaningful when there is no active cycle / no logs.
 */
export function CycleChart({ profile, activeCycle, activeLogs, heightClass = "h-64" }: CycleChartProps) {
  const cycleStart = activeCycle ? new Date(activeCycle.started_on) : new Date();
  const rawTemps: TempPoint[] = activeLogs
    .filter((l) => !l.excluded)
    .map((l) => ({
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

  const preFertileConfirmed = stats ? stats.cyclesAnalyzed >= 3 : false;
  // Once ovulation is confirmed by BBT, the luteal (post-ovulation) phase is
  // open and infertile — don't wait for "today" to pass the window.
  const postFertileConfirmed = stats ? stats.ovulationConfirmed : false;

  const temps = rawTemps.map((p) => {
    let kind: "fertile" | "safe" | "uncertain" = "safe";
    if (stats) {
      if (p.day >= stats.fertileStartDay && p.day <= stats.fertileEndDay) kind = "fertile";
      else if (p.day <= profile.period_length) kind = "safe";
      else if (p.day < stats.fertileStartDay) kind = preFertileConfirmed ? "safe" : "uncertain";
      else kind = postFertileConfirmed ? "safe" : "uncertain";
    }
    return { ...p, kind };
  });

  const maxLogDay = rawTemps.reduce((m, p) => Math.max(m, p.day), 0);
  const minLogDay = rawTemps.reduce((m, p) => Math.min(m, p.day), 1);
  const chartMaxDay = stats
    ? Math.max(stats.predictedCycleLength, stats.fertileEndDay + 2, stats.cycleDay, maxLogDay)
    : Math.max(profile.avg_cycle_length, maxLogDay, 1);
  const chartMinDay = Math.min(1, minLogDay);

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <ThermometerSun className="h-4 w-4" /> Temperature this cycle
      </h2>
      <div className={`mt-4 ${heightClass}`}>
        {temps.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No logs yet — send your morning temperature to see the chart.
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
              <XAxis
                dataKey="day"
                type="number"
                domain={[chartMinDay, chartMaxDay]}
                allowDecimals={false}
                stroke="hsl(220 10% 45%)"
                tick={{ fontSize: 11 }}
                label={{ value: "Cycle day", position: "insideBottom", offset: -2, fill: "hsl(220 10% 45%)", fontSize: 11 }}
              />
              <YAxis domain={[35.5, 37.5]} tickCount={5} stroke="hsl(220 10% 45%)" tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number, _n, item: any) => {
                  const k = item?.payload?.kind;
                  const label =
                    k === "fertile" ? "Fertile day" : k === "uncertain" ? "Treat as fertile (low confidence)" : "Low-fertility day";
                  return [`${v}°C`, label];
                }}
                labelFormatter={(d) => `Cycle day ${d}`}
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(220 15% 85%)", fontSize: 12 }}
              />
              {stats && (
                <ReferenceArea
                  x1={profile.period_length + 1}
                  x2={stats.fertileStartDay}
                  fill={preFertileConfirmed ? "hsl(142 70% 42% / 0.12)" : "hsl(0 75% 55% / 0.16)"}
                  stroke={preFertileConfirmed ? "hsl(142 70% 35%)" : "hsl(0 75% 50%)"}
                  strokeOpacity={0.25}
                  label={{
                    value: preFertileConfirmed ? "Infertile" : "Treat as fertile",
                    position: "insideTopLeft",
                    fontSize: 10,
                    fill: preFertileConfirmed ? "hsl(142 60% 30%)" : "hsl(0 65% 35%)",
                  }}
                />
              )}
              {stats && (
                <ReferenceArea
                  x1={stats.fertileEndDay}
                  x2={chartMaxDay}
                  fill={postFertileConfirmed ? "hsl(142 70% 42% / 0.12)" : "hsl(0 75% 55% / 0.16)"}
                  stroke={postFertileConfirmed ? "hsl(142 70% 35%)" : "hsl(0 75% 50%)"}
                  strokeOpacity={0.25}
                  label={{
                    value: postFertileConfirmed ? "Luteal phase · infertile" : "Treat as fertile",
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: postFertileConfirmed ? "hsl(142 60% 30%)" : "hsl(0 65% 35%)",
                  }}
                />
              )}
              {stats?.ovulationConfirmed && (
                <ReferenceLine
                  x={stats.estimatedOvulationDay}
                  stroke="hsl(280 70% 45%)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  label={{
                    value: `🥚 Ovulation · day ${stats.estimatedOvulationDay}`,
                    position: "top",
                    fontSize: 11,
                    fontWeight: 600,
                    fill: "hsl(280 60% 35%)",
                  }}
                />
              )}
              {stats && (
                <ReferenceArea
                  x1={stats.fertileStartDay}
                  x2={stats.fertileEndDay}
                  fill={stats.ovulationConfirmed ? "hsl(0 75% 55% / 0.28)" : "url(#fertileFill)"}
                  stroke={stats.ovulationConfirmed ? "hsl(0 75% 45%)" : "hsl(340 82% 55%)"}
                  strokeOpacity={0.3}
                  label={{
                    value: stats.ovulationConfirmed ? "Fertile window (confirmed)" : "Predicted fertile window",
                    position: "insideTop",
                    fontSize: 11,
                    fill: stats.ovulationConfirmed ? "hsl(0 65% 35%)" : "hsl(340 60% 40%)",
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
                  return <circle key={index} cx={cx} cy={cy} r={5} fill={fill} stroke="white" strokeWidth={2} />;
                }}
                activeDot={{ r: 7, strokeWidth: 2, stroke: "white" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {temps.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#dc2626" }} /> Fertile / treat as fertile
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#16a34a" }} /> Confidently infertile
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-3 rounded-sm"
              style={{ background: "hsl(340 82% 55% / 0.2)", border: "1px solid hsl(340 82% 55% / 0.4)" }}
            />
            Predicted fertile window
          </span>
        </div>
      )}
    </div>
  );
}
