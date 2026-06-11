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
  fertileStartDay: number;
  fertileEndDay: number;
  status: "early-cycle" | "pre-fertile" | "fertile" | "ovulation" | "post-ovulation" | "unknown";
  ovulationConfirmed: boolean;
  fertileWindowClosed: boolean;
  confidence: "low" | "medium" | "high";
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

// 3-over-6 BBT rule. Returns ovulation cycle-day (day before first elevated temp).
// Excludes points inside the menstrual phase — bleeding-day temps are noisy and
// would otherwise lower the baseline artificially.
export function detectOvulation(points: TempPoint[], periodLength = 0): number | null {
  const eligible = points.filter((p) => p.day > periodLength);
  if (eligible.length < 9) return null;
  const sorted = [...eligible].sort((a, b) => a.day - b.day);
  for (let i = 6; i <= sorted.length - 3; i++) {
    const baseline = sorted.slice(i - 6, i);
    const rise = sorted.slice(i, i + 3);
    const baselineMax = Math.max(...baseline.map((p) => p.temp));
    if (rise.every((p) => p.temp >= baselineMax + 0.2)) {
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
  const calendarOv = predictedCycleLength - 14;
  const detectedOv = detectOvulation(temps, periodLength);
  const ovulationDay = detectedOv ?? calendarOv;

  // ---- 3. Confidence ---------------------------------------------------------
  let confidence: CycleStats["confidence"];
  if (detectedOv !== null) confidence = "high";
  else if (validHistory.length >= 3) confidence = "medium";
  else confidence = "low";

  // ---- 4. Fertile window with variability buffer -----------------------------
  // NC-style: sperm survive ~5d before ovulation, egg viable ~1d after.
  // Add ceil(sd) extra days on each side to absorb cycle-length variability.
  // When confidence is low, force a wider buffer so unsure days stay RED.
  const buffer =
    confidence === "high" ? 0 : confidence === "medium" ? Math.max(1, Math.ceil(sd)) : Math.max(3, Math.ceil(sd) + 2);

  const fertileStartDay = Math.max(1, ovulationDay - 5 - buffer);
  const fertileEndDay = ovulationDay + 1 + buffer;

  // ---- 5. Status + human-readable message -----------------------------------
  let status: CycleStats["status"] = "unknown";
  let message = "";

  if (cycleDay <= periodLength && periodLength < fertileStartDay) {
    // Menstrual phase, safely outside the fertile buffer → confirmed low fertility (green).
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
    message =
      confidence === "high"
        ? `Day ${cycleDay}. Luteal phase confirmed by temperature rise — fertility is low. Next period expected around day ${predictedCycleLength + 1}.`
        : `Day ${cycleDay}. Likely post-ovulation. Next period expected around day ${predictedCycleLength + 1}.`;
  } else {
    status = "post-ovulation";
    message = `Day ${cycleDay}. Cycle is running longer than the ${predictedCycleLength}-day average; period may start any day.`;
  }

  return {
    cycleDay,
    estimatedOvulationDay: ovulationDay,
    fertileStartDay,
    fertileEndDay,
    status,
    ovulationConfirmed: detectedOv !== null,
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
