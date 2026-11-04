import { predictCycle, daysBetween, type CycleStats } from "./fertility";
import { classifyDay, type DayKind } from "./day-colors";

const DAY = 86400000;
export function projectCalendarDay(args: {
  date: Date; today: Date; cycleStart: Date; stats: CycleStats;
  periodLength: number; cycleHistory: number[]; hasLog?: boolean;
}): { day: number; stats: CycleStats; projected: boolean; bleedingStart: boolean; kind: DayKind } {
  const { date, today, cycleStart, stats, periodLength, cycleHistory, hasLog = false } = args;
  const absoluteDay = daysBetween(cycleStart, date) + 1;
  // BBT can move the current cycle's next-period estimate. Future cycles still
  // use the historical average; a forecast never inserts a real cycle.
  const currentLength = Math.max(stats.predictedCycleLength, stats.estimatedOvulationDay + 14);
  const expectedStart = cycleStart.getTime() + currentLength * DAY;
  // If bleeding is overdue, keep real past/today dates in the same cycle.
  // Future planning moves its first provisional start to tomorrow.
  const firstForecast = Math.max(expectedStart, today.getTime() + DAY);
  if (date.getTime() < firstForecast) return {
    day: absoluteDay, stats, projected: false,
    bleedingStart: date.getTime() === expectedStart,
    kind: classifyDay({ cycleDay: absoluteDay, stats, hasLog }),
  };
  const length = Math.max(20, Math.min(45, stats.predictedCycleLength));
  const offset = daysBetween(new Date(firstForecast), date);
  const day = offset % length + 1;
  const start = new Date(firstForecast + Math.floor(offset / length) * length * DAY);
  const prediction = predictCycle({ cycleStart: start, today: start, avgCycleLength: length, periodLength, temps: [], cycleHistory });
  const fertile = day >= prediction.fertileStartDay && day <= prediction.fertileEndDay;
  return { day, stats: prediction, projected: true, bleedingStart: day === 1,
    kind: fertile ? "predicted-fertile" : "predicted-infertile" };
}

export function validateBleedingDate(date: string, today: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > today)
    throw new Error("Choose today or an earlier bleeding start date.");
}