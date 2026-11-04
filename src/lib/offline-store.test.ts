import { beforeEach, describe, expect, it } from "vitest";
import { acknowledgeTemperature, clearOfflineOwner, mergeTemperatures, offlineKey, pendingTemperatures, queueTemperature, validateTemperature, type DashboardData } from "./offline-store";
import { blockAppWorker } from "./pwa-context";
import { confirmLutealPhase } from "./fertility";

const entry = { loggedFor: "2026-11-04", tempCelsius: 36.72, sick: false, disruptedMorning: false };
beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
});

describe("offline temperature rules", () => {
  it("rejects future temperature dates", () => {
    expect(() => validateTemperature({ ...entry, loggedFor: "2026-11-05" }, "2026-11-04")).toThrow();
    expect(() => validateTemperature(entry, "2026-11-04")).not.toThrow();
  });
  it("preserves the 35.00–38.00 range", () => {
    for (const tempCelsius of [34.99, 38.01]) expect(() => validateTemperature({ ...entry, tempCelsius }, "2026-11-04")).toThrow();
    for (const tempCelsius of [35, 38]) expect(() => validateTemperature({ ...entry, tempCelsius }, "2026-11-04")).not.toThrow();
  });
  it("durably stores readings and keeps accounts separate", () => {
    queueTemperature("owner-a", entry, "2026-11-04");
    expect(pendingTemperatures("owner-a")[0].tempCelsius).toBe(36.72);
    expect(pendingTemperatures("owner-b")).toEqual([]);
  });
  it("retains a correction if an earlier revision is acknowledged", () => {
    const first = queueTemperature("owner-a", entry, "2026-11-04")[0];
    queueTemperature("owner-a", { ...entry, tempCelsius: 36.81 }, "2026-11-04");
    acknowledgeTemperature("owner-a", first.revision);
    expect(pendingTemperatures("owner-a")).toHaveLength(1);
    expect(pendingTemperatures("owner-a")[0].tempCelsius).toBe(36.81);
  });
  it("does not lose an unacknowledged reading", () => {
    const queued = queueTemperature("owner-a", entry, "2026-11-04");
    expect(pendingTemperatures("owner-a")).toEqual(queued);
    acknowledgeTemperature("owner-a", queued[0].revision);
    expect(pendingTemperatures("owner-a")).toEqual([]);
  });
  it("clears only the signed-out account", () => {
    queueTemperature("owner-a", entry, "2026-11-04");
    queueTemperature("owner-b", entry, "2026-11-04");
    localStorage.setItem(offlineKey("owner-a", "queries"), "{}");
    clearOfflineOwner("owner-a");
    expect(pendingTemperatures("owner-a")).toEqual([]);
    expect(localStorage.getItem(offlineKey("owner-a", "queries"))).toBeNull();
    expect(pendingTemperatures("owner-b")).toHaveLength(1);
  });
  it("excludes sick and disrupted readings from local calculations", () => {
    const data = { profile: null, cycles: [], activeCycle: { started_on: "2026-11-01" }, activeLogs: [], allLogs: [] } as unknown as DashboardData;
    for (const flags of [{ sick: true, disruptedMorning: false }, { sick: false, disruptedMorning: true }]) {
      const merged = mergeTemperatures(data, [{ ...entry, ...flags, revision: "test" }]);
      expect(merged.activeLogs[0].excluded).toBe(true);
      expect(merged.allLogs[0].temp_celsius).toBe(36.72);
    }
  });
  it("recalculates ovulation from queued readings before reconnecting", () => {
    const logs = [36.2, 36.25, 36.21, 36.23, 36.24, 36.22, 36.4, 36.45].map((temp_celsius, index) => ({
      logged_for: `2026-10-${String(index + 1).padStart(2, "0")}`, temp_celsius, excluded: false, cycle_id: "cycle", exclude_reason: null,
    }));
    const data = { profile: null, cycles: [{ id: "cycle", started_on: "2026-10-01", ended_on: null }], activeCycle: { id: "cycle", started_on: "2026-10-01" }, activeLogs: logs, allLogs: logs } as unknown as DashboardData;
    const points = (d: DashboardData) => d.activeLogs.filter((l) => !l.excluded).map((l, index) => ({ day: index + 1, temp: Number(l.temp_celsius), date: l.logged_for }));
    expect(confirmLutealPhase(points(data)).confirmed).toBe(false);
    const merged = mergeTemperatures(data, [{ ...entry, loggedFor: "2026-10-09", tempCelsius: 36.5, revision: "rise" }]);
    expect(confirmLutealPhase(points(merged)).confirmed).toBe(true);
    expect(merged.activeLogs).toHaveLength(9);
  });
});

describe("preview-safe worker registration", () => {
  it("blocks all Lovable preview forms and dev", () => {
    for (const host of ["id-preview--app.lovable.app", "preview-v2--app.lovable.app", "ID-PREVIEW-4--APP.GPT-ENG.COM", "project--abc-dev.lovable.app", "sub.lovableproject.com", "beta.lovable.dev"])
      expect(blockAppWorker(host, true, false, false)).toBe(true);
    expect(blockAppWorker("example.com", false, false, false)).toBe(true);
    expect(blockAppWorker("example.com", true, true, false)).toBe(true);
    expect(blockAppWorker("example.com", true, false, true)).toBe(true);
  });
  it("permits published and custom domains", () => {
    expect(blockAppWorker("bloom-tune.lovable.app", true, false, false)).toBe(false);
    expect(blockAppWorker("preview-v2--shop.example.com", true, false, false)).toBe(false);
    expect(blockAppWorker("delegated.example.com", true, false, false, "delegated.example.com")).toBe(true);
  });
});