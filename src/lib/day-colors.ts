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
  if (cycleDay < 1) return "outside";

  const fertile = cycleDay >= stats.fertileStartDay && cycleDay <= stats.fertileEndDay;
  const past = cycleDay <= stats.cycleDay;

  if (fertile) return past && stats.ovulationConfirmed ? "confirmed-fertile" : "predicted-fertile";

  // A calendar estimate or one logged temperature cannot establish a safe day.
  // Before the fertile window, require enough cycle history; after it, require
  // the sustained BBT rise that actually closes the fertile window.
  const beforeWindow = cycleDay < stats.fertileStartDay;
  const safelyBeforeWindow = beforeWindow && stats.cyclesAnalyzed >= 3;
  const safelyAfterWindow = !beforeWindow && stats.ovulationConfirmed;
  if (safelyBeforeWindow || safelyAfterWindow) {
    return past ? "confirmed-infertile" : "predicted-infertile";
  }

  // Uncertain days remain red even if a temperature was recorded for that day.
  return "predicted-fertile";
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
