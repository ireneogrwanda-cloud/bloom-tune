import { describe, expect, it } from "vitest";
import { predictCycle } from "./fertility";
import { projectCalendarDay, validateBleedingDate } from "./calendar-projection";

const cycleStart = new Date("2026-11-01T00:00:00Z");
const today = new Date("2026-11-04T00:00:00Z");
const stats = predictCycle({ cycleStart, today, avgCycleLength: 28, periodLength: 5, temps: [], cycleHistory: [28, 28, 28] });
const project = (date: string) => projectCalendarDay({ date: new Date(`${date}T00:00:00Z`), today, cycleStart, stats, periodLength: 5, cycleHistory: [28, 28, 28] });

describe("future calendar", () => {
  it("repeats light fertile and infertile predictions across later months", () => {
    expect(project("2026-12-12").kind).toBe("predicted-fertile");
    expect(project("2026-12-22").kind).toBe("predicted-infertile");
    expect(project("2027-03-01").projected).toBe(true);
    expect(project("2027-03-01").kind.startsWith("predicted-")).toBe(true);
  });
  it("marks forecast cycle starts without confirming or creating them", () => {
    const next = project("2026-11-29");
    expect(next.day).toBe(1);
    expect(next.bleedingStart).toBe(true);
    expect(next.stats.ovulationConfirmed).toBe(false);
  });
  it("keeps overdue today in the real active cycle", () => {
    const result = projectCalendarDay({ date: new Date("2026-12-05T00:00:00Z"), today: new Date("2026-12-05T00:00:00Z"), cycleStart, stats, periodLength: 5, cycleHistory: [] });
    expect(result.projected).toBe(false);
    expect(result.day).toBe(35);
  });
  it("moves future bleeding predictions when temperature-based ovulation moves", () => {
    const lateStats = { ...stats, ovulationConfirmed: true, estimatedOvulationDay: 20 };
    const result = projectCalendarDay({ date: new Date("2026-12-05T00:00:00Z"), today, cycleStart, stats: lateStats, periodLength: 5, cycleHistory: [28, 28, 28] });
    expect(result.day).toBe(1);
    expect(result.bleedingStart).toBe(true);
    expect(project("2026-12-05").day).toBe(7);
  });
});

describe("forgotten bleeding dates", () => {
  it("accepts an earlier bleeding date", () => {
    expect(() => validateBleedingDate("2026-10-07", "2026-11-04")).not.toThrow();
  });
  it("rejects future or invalid bleeding dates", () => {
    expect(() => validateBleedingDate("2026-11-05", "2026-11-04")).toThrow();
    expect(() => validateBleedingDate("2026-02-30", "2026-11-04")).toThrow();
  });
});