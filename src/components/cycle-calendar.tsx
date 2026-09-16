import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Egg, Droplet } from "lucide-react";
import { predictCycle, isoDate, type TempPoint } from "@/lib/fertility";
import { classifyDay, cycleDayFor, DAY_STYLES } from "@/lib/day-colors";
import { useT } from "@/lib/i18n";

export type CalendarProfile = { avg_cycle_length: number; period_length: number };

export type CycleCalendarProps = {
  profile: CalendarProfile;
  activeCycle: { started_on: string } | null;
  activeLogs: Array<{ logged_for: string; temp_celsius: number | string; excluded?: boolean }>;
  onSelectDate: (iso: string) => void;
};

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function CycleCalendar({ profile, activeCycle, activeLogs, onSelectDate }: CycleCalendarProps) {
  const today = new Date();
  const { t } = useT();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const cycleStart = activeCycle ? new Date(activeCycle.started_on) : null;

  const logMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of activeLogs) m.set(l.logged_for, Number(l.temp_celsius));
    return m;
  }, [activeLogs]);

  const stats = useMemo(() => {
    if (!cycleStart) return null;
    const temps: TempPoint[] = activeLogs
      .filter((l) => !l.excluded)
      .map((l) => ({
        day: cycleDayFor(cycleStart, new Date(l.logged_for)),
        temp: Number(l.temp_celsius),
        date: l.logged_for,
      }));
    return predictCycle({
      cycleStart,
      today,
      avgCycleLength: profile.avg_cycle_length,
      periodLength: profile.period_length,
      temps,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCycle?.started_on, activeLogs, profile.avg_cycle_length, profile.period_length]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7; // Monday-first

  const cells: (Date | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="rounded-full p-1.5 hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-sm font-semibold">
          {month.toLocaleDateString([], { month: "long", year: "numeric" })}
        </h2>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="rounded-full p-1.5 hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </header>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const iso = isoDate(d);
          const day = cycleStart ? cycleDayFor(cycleStart, d) : 0;
          const kind =
            stats && cycleStart
              ? classifyDay({ cycleDay: day, stats, hasLog: logMap.has(iso) })
              : "outside";
          const isToday = isoDate(today) === iso;
          const isOvulation = !!stats && day === stats.estimatedOvulationDay && day >= 1;
          const isPredictedBleed = !!stats && day === stats.predictedCycleLength + 1;
          const temp = logMap.get(iso);
          // A temperature can only exist for a day that has happened.
          const isFuture = iso > isoDate(today);

          return (
            <button
              key={iso}
              type="button"
              disabled={isFuture}
              onClick={() => onSelectDate(iso)}
              aria-label={
                isFuture
                  ? `${d.toLocaleDateString()} — future day`
                  : `${d.toLocaleDateString()} — tap to add temperature`
              }
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-xs transition-transform active:scale-95 ${DAY_STYLES[kind]} ${
                isToday ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""
              } ${isFuture ? "cursor-not-allowed opacity-40" : ""}`}
            >

              <span className="font-semibold leading-none">{d.getDate()}</span>
              {day >= 1 && kind !== "outside" ? (
                <span className="mt-0.5 text-[9px] leading-none opacity-80">d{day}</span>
              ) : null}
              {isOvulation ? <Egg className="absolute right-0.5 top-0.5 h-3 w-3 opacity-90" /> : null}
              {isPredictedBleed ? (
                <Droplet className="absolute right-0.5 top-0.5 h-3 w-3 fill-rose-500 text-rose-600" />
              ) : null}
              {temp ? <span className="mt-0.5 text-[8px] leading-none opacity-80">{temp.toFixed(2)}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <Legend className="bg-emerald-600" label={t("Infertile — confirmed")} />
        <Legend className="bg-emerald-100" label={t("Infertile — predicted")} />
        <Legend className="bg-rose-600" label={t("Fertile — confirmed")} />
        <Legend className="bg-rose-200" label={t("Fertile — predicted")} />
        <span className="inline-flex items-center gap-1">
          <Egg className="h-3 w-3" /> Ovulation day
        </span>
        <span className="inline-flex items-center gap-1">
          <Droplet className="h-3 w-3 fill-rose-500 text-rose-600" /> Expected bleeding · next cycle start
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Tap any day to add or update that morning's temperature. Predictions can change with each new reading.
      </p>
    </section>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-3 w-3 rounded ${className}`} />
      {label}
    </span>
  );
}
