import { describe, expect, it } from "vitest";
import { classifyDay } from "./day-colors";
import type { CycleStats } from "./fertility";

const baseStats: CycleStats = {
  cycleDay: 16,
  estimatedOvulationDay: 18,
  ovulationDayMin: 14,
  ovulationDayMax: 22,
  fertileStartDay: 10,
  fertileEndDay: 20,
  status: "fertile",
  ovulationConfirmed: false,
  fertileWindowClosed: false,
  confidence: "medium",
  cyclesAnalyzed: 4,
  predictedCycleLength: 29,
  cycleLengthStdDev: 1.5,
  message: "",
};

describe("classifyDay — logged days use confirmed colors, predictions only for the future", () => {
  it("a logged day inside the fertile window is solid fertile, not predicted", () => {
    expect(classifyDay({ cycleDay: 12, stats: baseStats, hasLog: true })).toBe("confirmed-fertile");
    expect(classifyDay({ cycleDay: 12, stats: baseStats, hasLog: false })).toBe("predicted-fertile");
  });

  it("a logged day after confirmed ovulation is solid infertile", () => {
    const stats = { ...baseStats, ovulationConfirmed: true, status: "post-ovulation" as const };
    expect(classifyDay({ cycleDay: 21, stats, hasLog: true })).toBe("confirmed-infertile");
  });

  it("a future day after confirmed ovulation stays light predicted infertile", () => {
    const stats = { ...baseStats, ovulationConfirmed: true, status: "post-ovulation" as const };
    expect(classifyDay({ cycleDay: 25, stats, hasLog: false })).toBe("predicted-infertile");
  });

  it("a logged day before the window is solid infertile only with enough cycle history", () => {
    expect(classifyDay({ cycleDay: 5, stats: baseStats, hasLog: true })).toBe("confirmed-infertile");
    const noHistory = { ...baseStats, cyclesAnalyzed: 1 };
    expect(classifyDay({ cycleDay: 5, stats: noHistory, hasLog: true })).toBe("predicted-fertile");
  });

  it("an uncertain day stays red even when a temperature was logged", () => {
    const uncertain = { ...baseStats, cyclesAnalyzed: 0, fertileStartDay: 12, fertileEndDay: 24 };
    expect(classifyDay({ cycleDay: 8, stats: uncertain, hasLog: true })).toBe("predicted-fertile");
  });
});
