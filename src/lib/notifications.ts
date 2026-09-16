// Pure notification builders — no database access, so both the app and the
// scheduled reminder job can produce exactly the same alerts.
import { daysBetween, predictCycle, type TempPoint } from "@/lib/fertility";

export type NotificationDraft = {
  kind: "bbt_reminder" | "fertile_window" | "ovulation" | "luteal" | "period_due" | "monthly_summary";
  title: string;
  body: string;
  dedupe_key: string;
};

export type CycleRow = {
  id: string;
  started_on: string;
  ended_on: string | null;
  status: string;
};

export type LogRow = {
  logged_for: string;
  temp_celsius: number | string;
  cycle_id: string | null;
  excluded?: boolean | null;
};

export function toPoints(cycleStart: string, logs: LogRow[]): TempPoint[] {
  const start = new Date(`${cycleStart}T00:00:00`);
  return logs
    .filter((l) => !l.excluded)
    .map((l) => ({
      day: daysBetween(start, new Date(`${l.logged_for}T00:00:00`)) + 1,
      temp: Number(l.temp_celsius),
      date: l.logged_for,
    }))
    .filter((p) => p.day >= 1)
    .sort((a, b) => a.day - b.day);
}

export function cycleHistoryLengths(cycles: CycleRow[]): number[] {
  return cycles
    .filter((c) => c.ended_on)
    .map((c) => daysBetween(new Date(`${c.started_on}T00:00:00`), new Date(`${c.ended_on}T00:00:00`)) + 1)
    .filter((n) => n >= 20 && n <= 45);
}

/** Alerts derived from the user's current cycle state. */
export function buildCycleNotifications(args: {
  todayIso: string;
  avgCycleLength: number;
  periodLength: number;
  activeCycle: CycleRow | null;
  activeLogs: LogRow[];
  cycles: CycleRow[];
}): NotificationDraft[] {
  const { todayIso, avgCycleLength, periodLength, activeCycle, activeLogs, cycles } = args;
  const out: NotificationDraft[] = [];

  // 1. Morning reminder — only when today's temperature is still missing.
  const loggedToday = activeLogs.some((l) => l.logged_for === todayIso);
  if (!loggedToday) {
    out.push({
      kind: "bbt_reminder",
      title: "Time for your morning temperature",
      body: "Take your BBT before getting out of bed and send it here — one reading keeps your predictions accurate.",
      dedupe_key: `bbt:${todayIso}`,
    });
  }

  if (!activeCycle) return out;

  const points = toPoints(activeCycle.started_on, activeLogs);
  const stats = predictCycle({
    cycleStart: new Date(`${activeCycle.started_on}T00:00:00`),
    today: new Date(`${todayIso}T00:00:00`),
    avgCycleLength,
    periodLength,
    temps: points,
    cycleHistory: cycleHistoryLengths(cycles),
  });

  const c = activeCycle.id;

  // 2. Fertile window / ovulation.
  if (stats.cycleDay >= stats.fertileStartDay && stats.cycleDay <= stats.fertileEndDay && !stats.fertileWindowClosed) {
    out.push({
      kind: "fertile_window",
      title: "🔴 Your fertile window is open",
      body: `Day ${stats.cycleDay} — fertile days ${stats.fertileStartDay}–${stats.fertileEndDay}. Ovulation expected around day ${stats.estimatedOvulationDay}. Use protection if you are avoiding pregnancy.`,
      dedupe_key: `fertile:${c}:${stats.fertileStartDay}`,
    });
  } else if (stats.cycleDay < stats.fertileStartDay && stats.fertileStartDay - stats.cycleDay <= 2) {
    out.push({
      kind: "fertile_window",
      title: "Fertile window starts soon",
      body: `Day ${stats.cycleDay} — your fertile days are expected to begin on day ${stats.fertileStartDay}.`,
      dedupe_key: `fertile-soon:${c}:${stats.fertileStartDay}`,
    });
  }

  if (stats.ovulationConfirmed) {
    out.push({
      kind: "ovulation",
      title: "🥚 Ovulation confirmed",
      body: `Your temperature shift confirms ovulation around day ${stats.estimatedOvulationDay}.`,
      dedupe_key: `ovulation:${c}:${stats.estimatedOvulationDay}`,
    });
  }
  if (stats.fertileWindowClosed) {
    out.push({
      kind: "luteal",
      title: "🟢 Luteal phase — infertile days",
      body: `Day ${stats.cycleDay}. Three elevated temperatures confirm the fertile window is closed until your next period.`,
      dedupe_key: `luteal:${c}`,
    });
  }

  // 3. Next period due.
  const daysToPeriod = stats.predictedCycleLength + 1 - stats.cycleDay;
  if (daysToPeriod <= 2 && daysToPeriod >= -1) {
    out.push({
      kind: "period_due",
      title: "Your period is due",
      body:
        daysToPeriod > 0
          ? `Expected in ${daysToPeriod} day${daysToPeriod === 1 ? "" : "s"} (around day ${stats.predictedCycleLength + 1}). Tell me the day bleeding starts so day 1 is exact.`
          : `Expected around now (day ${stats.predictedCycleLength + 1}). Tell me the day bleeding starts so day 1 is exact.`,
      dedupe_key: `period-due:${c}:${stats.predictedCycleLength}`,
    });
  }

  return out;
}

/** End-of-cycle recap for a finished cycle. */
export function buildCycleSummary(cycle: CycleRow, logs: LogRow[], avgCycleLength: number, periodLength: number): NotificationDraft | null {
  const points = toPoints(cycle.started_on, logs);
  if (points.length === 0 || !cycle.ended_on) return null;
  const length = daysBetween(new Date(`${cycle.started_on}T00:00:00`), new Date(`${cycle.ended_on}T00:00:00`)) + 1;
  const avg = points.reduce((s, p) => s + p.temp, 0) / points.length;
  const stats = predictCycle({
    cycleStart: new Date(`${cycle.started_on}T00:00:00`),
    today: new Date(`${cycle.ended_on}T00:00:00`),
    avgCycleLength,
    periodLength,
    temps: points,
    cycleHistory: [],
  });
  const started = new Date(`${cycle.started_on}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return {
    kind: "monthly_summary",
    title: "📊 Your cycle summary",
    body: `Cycle from ${started}: ${length} days, ${points.length} temperatures logged, average ${avg.toFixed(2)}°C. ${
      stats.ovulationConfirmed ? `Ovulation confirmed around day ${stats.estimatedOvulationDay}.` : "Ovulation was not confirmed by temperature this cycle."
    }`,
    dedupe_key: `summary:${cycle.id}`,
  };
}
