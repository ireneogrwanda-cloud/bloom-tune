// Pure fertility-prediction helpers. Safe to import on client and server.
//
// IMPORTANT: This is for educational tracking only — not a contraceptive
// method and not medical advice.

export type TempPoint = { day: number; temp: number; date: string };

export type CycleStats = {
  cycleDay: number;
  estimatedOvulationDay: number;
  fertileStartDay: number;
  fertileEndDay: number;
  status: "menstrual" | "pre-fertile" | "fertile" | "ovulation" | "post-ovulation" | "unknown";
  ovulationConfirmed: boolean;
  message: string;
};

export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Detect ovulation using the 3-over-6 BBT rule.
// Returns the cycle-day of ovulation (the day BEFORE the first elevated temp)
// or null if not yet detectable.
export function detectOvulation(points: TempPoint[]): number | null {
  if (points.length < 9) return null;
  const sorted = [...points].sort((a, b) => a.day - b.day);
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
  avgCycleLength: number;
  periodLength: number;
  temps: TempPoint[];
}): CycleStats {
  const { cycleStart, today, avgCycleLength, periodLength, temps } = args;
  const cycleDay = daysBetween(cycleStart, today) + 1;

  const calendarOv = avgCycleLength - 14;
  const detectedOv = detectOvulation(temps);
  const ovulationDay = detectedOv ?? calendarOv;
  const fertileStartDay = Math.max(1, ovulationDay - 5);
  const fertileEndDay = ovulationDay + 1;

  let status: CycleStats["status"] = "unknown";
  let message = "";

  if (cycleDay <= periodLength) {
    status = "menstrual";
    message = `You're on day ${cycleDay} of your period. Fertility is very low right now.`;
  } else if (cycleDay < fertileStartDay) {
    status = "pre-fertile";
    message = `Day ${cycleDay}. Pre-fertile window — pregnancy chance is low. Your fertile window starts around day ${fertileStartDay}.`;
  } else if (cycleDay >= fertileStartDay && cycleDay < ovulationDay) {
    status = "fertile";
    message = `Day ${cycleDay}. You're in your fertile window. Ovulation expected around day ${ovulationDay}.`;
  } else if (cycleDay === ovulationDay) {
    status = "ovulation";
    message = `Day ${cycleDay}. Estimated ovulation day — peak fertility.`;
  } else if (cycleDay <= fertileEndDay) {
    status = "fertile";
    message = `Day ${cycleDay}. Still potentially fertile (post-ovulation). Window closes after day ${fertileEndDay}.`;
  } else if (cycleDay <= avgCycleLength) {
    status = "post-ovulation";
    message = `Day ${cycleDay}. Luteal phase — fertility is low. Next period expected around day ${avgCycleLength + 1}.`;
  } else {
    status = "post-ovulation";
    message = `Day ${cycleDay}. Cycle is longer than average; period may start any day.`;
  }

  return {
    cycleDay,
    estimatedOvulationDay: ovulationDay,
    fertileStartDay,
    fertileEndDay,
    status,
    ovulationConfirmed: detectedOv !== null,
    message,
  };
}

// Parse a temperature value from a free-text WhatsApp message.
// Accepts "36.7", "36,55", "97.4F", "97.4 f"
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
