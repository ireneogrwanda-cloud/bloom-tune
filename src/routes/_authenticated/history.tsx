import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard } from "@/lib/profile.functions";
import { CycleChart } from "@/components/cycle-chart";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "History — My Cycle AI" },
      { name: "description", content: "Every cycle you have tracked, with its temperature readings and length." },
      { property: "og:title", content: "History — My Cycle AI" },
      { property: "og:description", content: "Review your past cycles and daily temperature readings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const fetchDash = useServerFn(getDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDash() });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data?.profile) return <p className="text-sm text-muted-foreground">Nothing tracked yet.</p>;

  const logs = [...data.activeLogs].sort((a: any, b: any) => (a.logged_for < b.logged_for ? 1 : -1));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">History</h1>

      {data.activeCycle ? (
        <CycleChart profile={data.profile} activeCycle={data.activeCycle} activeLogs={data.activeLogs} />
      ) : null}

      <section>
        <h2 className="mb-2 font-semibold">Cycles</h2>
        <div className="divide-y rounded-2xl border bg-card">
          {data.cycles.length === 0 && <p className="p-5 text-sm text-muted-foreground">No cycles recorded yet.</p>}
          {data.cycles.map((c: any) => {
            const start = new Date(c.started_on);
            const end = c.ended_on ? new Date(c.ended_on) : null;
            const length = end ? Math.round((end.getTime() - start.getTime()) / 86400000) : null;
            return (
              <div key={c.id} className="flex items-center justify-between p-4 text-sm">
                <div>
                  <p className="font-medium">
                    {c.started_on} {c.ended_on ? `→ ${c.ended_on}` : "(active)"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {length ? `${length} days` : "In progress"}
                    {c.ovulation_day ? ` · ovulation day ${c.ovulation_day}` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    c.status === "active" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c.status}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Temperature readings (current cycle)</h2>
        <div className="divide-y rounded-2xl border bg-card">
          {logs.length === 0 && <p className="p-5 text-sm text-muted-foreground">No readings logged yet.</p>}
          {logs.map((l: any) => (
            <div key={l.id ?? l.logged_for} className="flex items-center justify-between p-3 text-sm">
              <span>{l.logged_for}</span>
              <span className={l.excluded ? "text-muted-foreground line-through" : "font-medium"}>
                {Number(l.temp_celsius).toFixed(2)}°C
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
