import type { getDashboard } from "@/lib/profile.functions";

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
export type TemperatureEntry = { loggedFor: string; tempCelsius: number; sick: boolean; disruptedMorning: boolean };
export type PendingTemperature = TemperatureEntry & { revision: string };
const PREFIX = "cycle-offline:v1:";
export const OWNER_KEY = `${PREFIX}owner`;
export const offlineKey = (owner: string, kind: string) => `${PREFIX}${owner}:${kind}`;

export function readLocal<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
}

export function pendingTemperatures(owner: string): PendingTemperature[] {
  return readLocal(offlineKey(owner, "temperatures"), []);
}

export function validateTemperature(entry: TemperatureEntry, today: string) {
  const date = new Date(`${entry.loggedFor}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.loggedFor) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== entry.loggedFor)
    throw new Error("Choose a valid date.");
  if (entry.loggedFor > today) throw new Error("You can't log a temperature for a future day.");
  if (!Number.isFinite(entry.tempCelsius) || entry.tempCelsius < 35 || entry.tempCelsius > 38)
    throw new Error("Enter a temperature between 35.00 and 38.00°C");
}

export function queueTemperature(owner: string, entry: TemperatureEntry, today: string) {
  validateTemperature(entry, today);
  const next = [...pendingTemperatures(owner).filter((p) => p.loggedFor !== entry.loggedFor), { ...entry, revision: crypto.randomUUID() }];
  // A failed storage write must not be reported as a saved reading.
  localStorage.setItem(offlineKey(owner, "temperatures"), JSON.stringify(next));
  return next;
}

export function acknowledgeTemperature(owner: string, revision: string) {
  const next = pendingTemperatures(owner).filter((p) => p.revision !== revision);
  localStorage.setItem(offlineKey(owner, "temperatures"), JSON.stringify(next));
  return next;
}

export function mergeTemperatures(data: DashboardData, pending: PendingTemperature[]): DashboardData {
  let activeLogs = [...data.activeLogs];
  let allLogs = [...data.allLogs];
  for (const entry of pending) {
    const cycle = data.cycles.find((c) => c.started_on <= entry.loggedFor && (!c.ended_on || entry.loggedFor < c.ended_on));
    const log = { logged_for: entry.loggedFor, temp_celsius: entry.tempCelsius, excluded: entry.sick || entry.disruptedMorning, cycle_id: cycle?.id ?? null,
      exclude_reason: entry.sick ? "fever-or-illness" : entry.disruptedMorning ? "disrupted-morning" : null };
    allLogs = [...allLogs.filter((l) => l.logged_for !== entry.loggedFor), log];
    if (data.activeCycle && entry.loggedFor >= data.activeCycle.started_on)
      activeLogs = [...activeLogs.filter((l) => l.logged_for !== entry.loggedFor), log];
  }
  return { ...data, activeLogs: activeLogs.sort((a, b) => a.logged_for.localeCompare(b.logged_for)), allLogs: allLogs.sort((a, b) => a.logged_for.localeCompare(b.logged_for)) };
}

export function cachedOwner(): string | null {
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}

export function clearOfflineOwner(owner: string) {
  localStorage.removeItem(offlineKey(owner, "queries"));
  localStorage.removeItem(offlineKey(owner, "temperatures"));
  localStorage.removeItem(OWNER_KEY);
}