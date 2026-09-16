// Classifies each calendar day of the current cycle into the four states the
// calendar paints: confirmed fertile / confirmed infertile / predicted fertile /
// predicted infertile, plus the ovulation marker.

import { daysBetween, type CycleStats } from "./fertility";

export type DayKind =
  | "confirmed-fertile"
  | "confirmed-infertile"
  | "predicted-fertile"
  | "predicted-infertile"
  | "outside";

export function cycleDayFor(cycleStart: Date, date: Date): number {
  return daysBetween(cycleStart, date) + 1;
}

export function classifyDay(args: {
  cycleDay: number;
  stats: CycleStats;
  hasLog: boolean;
}): DayKind {
  const { cycleDay, stats, hasLog } = args;
  if (cycleDay < 1 || cycleDay > stats.predictedCycleLength + 10) return "outside";

  const fertile = cycleDay >= stats.fertileStartDay && cycleDay <= stats.fertileEndDay;

  // A day is "confirmed" only when it has already happened AND we have enough
  // evidence: a temperature shift confirmed, or at least medium confidence with
  // a logged temperature for that day.
  const past = cycleDay <= stats.cycleDay;
  const certain =
    past && (stats.ovulationConfirmed || (stats.confidence !== "low" && (hasLog || cycleDay <= stats.cycleDay - 1)));

  if (fertile) return certain ? "confirmed-fertile" : "predicted-fertile";
  return certain ? "confirmed-infertile" : "predicted-infertile";
}

export const DAY_STYLES: Record<DayKind, string> = {
  "confirmed-fertile": "bg-rose-600 text-white",
  "predicted-fertile": "bg-rose-200 text-rose-900",
  "confirmed-infertile": "bg-emerald-600 text-white",
  "predicted-infertile": "bg-emerald-100 text-emerald-900",
  outside: "bg-muted/40 text-muted-foreground",
};

export const DAY_LABELS: Record<DayKind, string> = {
  "confirmed-fertile": "Fertile (confirmed)",
  "predicted-fertile": "Fertile (predicted)",
  "confirmed-infertile": "Infertile (confirmed)",
  "predicted-infertile": "Infertile (predicted)",
  outside: "Outside this cycle",
};
