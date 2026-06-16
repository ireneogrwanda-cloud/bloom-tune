// Natural-Cycles-inspired fertility prediction.
//
// Algorithm:
//  1. Cycle-length history → mean + sample standard deviation.
//  2. Predicted ovulation day = mean − 14 (luteal phase is biologically
//     stable at ~14 days, far less variable than follicular phase).
//  3. Fertile window = [ov − 5 − buffer, ov + 1 + buffer] where buffer
//     scales with cycle-length variability (more irregular ⇒ wider red zone).
//  4. BBT 3-over-6 detection overrides the calendar estimate and shrinks
//     the window to a narrow, confirmed range (high confidence).
//  5. When unsure (cycleDay inside or near the predicted window, low data),
//     mark RED. Only days clearly outside the buffered window are GREEN.

export type TempPoint = { day: number; temp: number; date: string };

export type CycleStats = {
  cycleDay: number;
  estimatedOvulationDay: number;
  ovulationDayMin: number;
  ovulationDayMax: number;
  fertileStartDay: number;
  fertileEndDay: number;
  status: "early-cycle" | "pre-fertile" | "fertile" | "ovulation" | "post-ovulation" | "unknown";
  ovulationConfirmed: boolean;
  fertileWindowClosed: boolean;
  confidence: "low" | "medium" | "high";
  cyclesAnalyzed: number;
  predictedCycleLength: number;
  cycleLengthStdDev: number;
  message: string;
};

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

// 3-over-6 BBT rule with coverline + minimum-rise threshold.
//
// Coverline = max(baseline). We require each of the next 3 readings to sit
// strictly above the coverline AND at least one of them to clear it by
// MIN_RISE_C, so a noise-level drift (e.g. +0.01°C) cannot falsely confirm
// ovulation. Matches standard FAM teaching (Sensiplan / Justisse use a
// ~0.2°C clearing rule on the 3rd elevated day).
//
// Excludes points inside the menstrual phase — bleeding-day temps are noisy
// and would otherwise lower the baseline artificially.
export const MIN_RISE_C = 0.2;

export function detectOvulation(points: TempPoint[], periodLength = 0): number | null {
  const eligible = points.filter((p) => p.day > periodLength);
  if (eligible.length < 6) return null;
  const sorted = [...eligible].sort((a, b) => a.day - b.day);
  for (let i = 3; i <= sorted.length - 3; i++) {
    const baseline = sorted.slice(Math.max(0, i - 6), i);
    if (baseline.length < 3) continue;
    const rise = sorted.slice(i, i + 3);
    const coverline = Math.max(...baseline.map((p) => p.temp));
    const allAbove = rise.every((p) => p.temp > coverline);
    const clearsMinRise = rise.some((p) => p.temp >= coverline + MIN_RISE_C);
    if (allAbove && clearsMinRise) {
      return sorted[i].day - 1;
    }
  }
  return null;
}

export function predictCycle(args: {
  cycleStart: Date;
  today: Date;
  avgCycleLength: number; // user-provided fallback
  periodLength: number;
  temps: TempPoint[];
  cycleHistory?: number[]; // lengths of completed past cycles
}): CycleStats {
  const { cycleStart, today, avgCycleLength, periodLength, temps, cycleHistory = [] } = args;
  const cycleDay = daysBetween(cycleStart, today) + 1;

  // ---- 1. Cycle-length model -------------------------------------------------
  const validHistory = cycleHistory.filter((n) => n >= 20 && n <= 45);
  const predictedCycleLength =
    validHistory.length >= 2 ? Math.round(mean(validHistory)) : avgCycleLength;
  const sd = validHistory.length >= 3 ? stddev(validHistory) : 2.5; // assume ±2.5d when unknown

  // ---- 2. Ovulation estimate -------------------------------------------------
  // BBT 3-over-6 rule = strong evidence. Calendar estimate = weak prior that
  // gets overridden when logged temps contradict it (e.g. still at baseline
  // around the calendar ovulation day).
  const calendarOv = predictedCycleLength - 14;
  const detectedOv = detectOvulation(temps, periodLength);

  // If BBT hasn't confirmed ovulation but we have temps past the calendar
  // ovulation day that are still at baseline, ovulation likely hasn't happened
  // yet — push the estimate forward so the fertile window stays open.
  let calendarOvAdjusted = calendarOv;
  if (detectedOv === null && temps.length >= 3) {
    const sorted = [...temps].sort((a, b) => a.day - b.day);
    const lastDay = sorted[sorted.length - 1].day;
    const baselinePool = sorted.filter((p) => p.day > periodLength && p.day < calendarOv);
    if (baselinePool.length >= 3 && lastDay >= calendarOv) {
      const baselineMax = Math.max(...baselinePool.map((p) => p.temp));
      const recent = sorted.slice(-3);
      const sustainedRise =
        recent.every((p) => p.temp > baselineMax) &&
        recent.some((p) => p.temp >= baselineMax + MIN_RISE_C);
      if (!sustainedRise) {
        // No confirmed rise yet — fertile window still open through latest log.
        calendarOvAdjusted = Math.max(calendarOv, lastDay + 1);
      }
    }
  }

  const ovulationDay = detectedOv ?? calendarOvAdjusted;

  // ---- 3. Confidence ---------------------------------------------------------
  let confidence: CycleStats["confidence"];
  if (detectedOv !== null) confidence = "high";
  else if (validHistory.length >= 3) confidence = "medium";
  else confidence = "low";

  // ---- 4. Fertile window with variability buffer -----------------------------
  const buffer =
    confidence === "high" ? 0 : confidence === "medium" ? Math.max(1, Math.ceil(sd)) : Math.max(3, Math.ceil(sd) + 2);

  const fertileStartDay = Math.max(1, ovulationDay - 5 - buffer);
  const fertileEndDay = ovulationDay + 1 + buffer;

  // Fertile window is "closed" (safe to say no protection needed) ONLY when
  // BBT has confirmed ovulation via the 3-over-6 rule AND we are clearly past
  // the post-ovulation buffer. A single high reading is NOT enough.
  const fertileWindowClosed = detectedOv !== null && cycleDay > fertileEndDay;

  // ---- 5. Status + human-readable message -----------------------------------
  let status: CycleStats["status"] = "unknown";
  let message = "";

  if (cycleDay <= periodLength && periodLength < fertileStartDay) {
    status = "early-cycle";
    message = `Day ${cycleDay} of your period. This is a confirmed low-fertility day — pregnancy chance is very low while you're bleeding.`;
  } else if (cycleDay <= periodLength) {
    status = "early-cycle";
    message = `Day ${cycleDay} of your period. Fertility is typically low, but your cycle history is too short for us to fully confirm — treat borderline days as potentially fertile.`;
  } else if (cycleDay < fertileStartDay) {
    status = "pre-fertile";
    message =
      confidence === "low"
        ? `Day ${cycleDay}. With limited cycle history, your fertile window is a wide estimate — treat borderline days as potentially fertile.`
        : `Day ${cycleDay}. Pre-fertile — pregnancy chance is low. Your fertile window starts around day ${fertileStartDay}.`;
  } else if (cycleDay >= fertileStartDay && cycleDay < ovulationDay) {
    status = "fertile";
    message = `Day ${cycleDay}. You're in your fertile window. Ovulation expected around day ${ovulationDay}.`;
  } else if (cycleDay === ovulationDay) {
    status = "ovulation";
    message = `Day ${cycleDay}. Estimated ovulation day — peak fertility.`;
  } else if (cycleDay <= fertileEndDay) {
    status = "fertile";
    message = `Day ${cycleDay}. Still potentially fertile. Window closes after day ${fertileEndDay}.`;
  } else if (cycleDay <= predictedCycleLength) {
    status = "post-ovulation";
    message = fertileWindowClosed
      ? `Day ${cycleDay}. Luteal phase confirmed — temperature has stayed elevated for 3+ days. Fertility is low. Next period expected around day ${predictedCycleLength + 1}.`
      : `Day ${cycleDay}. Likely post-ovulation, but not yet confirmed — fertility awareness methods need 3 consecutive elevated temperatures above the prior baseline before declaring the fertile window closed. Stay cautious.`;
  } else {
    status = "post-ovulation";
    message = `Day ${cycleDay}. Cycle is running longer than the ${predictedCycleLength}-day average; period may start any day.`;
  }

  // Ovulation range: collapses to single day when BBT-confirmed; otherwise
  // spreads with cycle-length variability (±ceil(sd), min ±1).
  const ovSpread = detectedOv !== null ? 0 : Math.max(1, Math.ceil(sd));
  const ovulationDayMin = Math.max(1, ovulationDay - ovSpread);
  const ovulationDayMax = ovulationDay + ovSpread;

  return {
    cycleDay,
    estimatedOvulationDay: ovulationDay,
    ovulationDayMin,
    ovulationDayMax,
    fertileStartDay,
    fertileEndDay,
    status,
    ovulationConfirmed: detectedOv !== null,
    fertileWindowClosed,
    confidence,
    predictedCycleLength,
    cycleLengthStdDev: Math.round(sd * 10) / 10,
    message,
  };
}

// Parse a temperature value from free-text. Accepts "36.7", "36,55", "97.4F".
export function parseTemperature(text: string): number | null {
  const m = text.match(/(\d{2,3}[.,]\d{1,2})\s*([cCfF])?/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(",", "."));
  if (!isFinite(num)) return null;
  const unit = m[2]?.toLowerCase();
  let c = num;
  if (unit === "f" || num > 80) c = ((num - 32) * 5) / 9;
  if (c < 35 || c > 40) return null;
  return Math.round(c * 100) / 100;
}
