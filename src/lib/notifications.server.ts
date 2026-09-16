// Server-only notification plumbing: turn cycle state into stored alerts and
// (when Firebase Cloud Messaging is connected) push them to the user's devices.
import {
  buildCycleNotifications,
  buildCycleSummary,
  type CycleRow,
  type LogRow,
  type NotificationDraft,
} from "@/lib/notifications";

type AnyClient = any;

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

export function todayIsoFor(now = new Date(), timeZone?: string) {
  if (!timeZone) return now.toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Compute due alerts for one user and store the ones that are new. */
export async function syncNotificationsFor(db: AnyClient, userId: string, todayIso: string) {
  const [{ data: profile }, { data: cycles }] = await Promise.all([
    db.from("profiles").select("*").eq("id", userId).maybeSingle(),
    db.from("cycles").select("*").eq("user_id", userId).order("started_on", { ascending: false }),
  ]);
  if (!profile) return [] as NotificationDraft[];

  const all: CycleRow[] = (cycles ?? []) as CycleRow[];
  const activeCycle = all.find((c) => c.status === "active") ?? null;

  let activeLogs: LogRow[] = [];
  if (activeCycle) {
    const { data } = await db
      .from("temperature_logs")
      .select("logged_for, temp_celsius, cycle_id, excluded")
      .eq("user_id", userId)
      .gte("logged_for", activeCycle.started_on)
      .order("logged_for");
    activeLogs = (data ?? []) as LogRow[];
  }

  const drafts = buildCycleNotifications({
    todayIso,
    avgCycleLength: profile.avg_cycle_length ?? 28,
    periodLength: profile.period_length ?? 5,
    activeCycle,
    activeLogs,
    cycles: all,
  });

  // Recap for the most recently finished cycle.
  const lastDone = all.find((c) => c.status !== "active" && c.ended_on);
  if (lastDone) {
    const { data: doneLogs } = await db
      .from("temperature_logs")
      .select("logged_for, temp_celsius, cycle_id, excluded")
      .eq("user_id", userId)
      .gte("logged_for", lastDone.started_on)
      .lte("logged_for", lastDone.ended_on!)
      .order("logged_for");
    const summary = buildCycleSummary(lastDone, (doneLogs ?? []) as LogRow[], profile.avg_cycle_length ?? 28, profile.period_length ?? 5);
    if (summary) drafts.push(summary);
  }

  if (drafts.length === 0) return [];

  const { data: inserted } = await db
    .from("notifications")
    .upsert(
      drafts.map((d) => ({ ...d, user_id: userId })),
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    )
    .select();

  const fresh = (inserted ?? []) as Array<NotificationDraft & { id: string }>;
  if (fresh.length) {
    // Mirror every new alert into the chat thread so the assistant shows the
    // same messages WhatsApp sends.
    await db.from("bot_messages").insert(
      fresh.map((n) => ({
        user_id: userId,
        direction: "out",
        body: `${n.title}\n\n${n.body}`,
      })),
    );
    await pushToUser(db, userId, fresh);
  }
  return fresh;

}

/** Fire-and-forget device push. Silently skipped until Firebase is connected. */
export async function pushToUser(db: AnyClient, userId: string, items: Array<{ id?: string; title: string; body: string }>) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["FIREBASE_MESSAGING_API_KEY"];
  if (!lovableKey || !connectionKey) return;

  const { data: tokens } = await db.from("push_tokens").select("token").eq("user_id", userId);
  if (!tokens?.length) return;

  for (const item of items) {
    for (const { token } of tokens as Array<{ token: string }>) {
      try {
        const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": connectionKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: item.title, body: item.body },
              data: { path: "/" },
            },
          }),
        });
        if (!res.ok) {
          const errorBody = await res.text();
          console.error(`FCM send failed [${res.status}]: ${errorBody}`);
          if (res.status === 404 || res.status === 400) {
            await db.from("push_tokens").delete().eq("token", token);
          }
        }
      } catch (e) {
        console.error("FCM send error", e);
      }
    }
  }

  if (items.some((i) => i.id)) {
    await db
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .in(
        "id",
        items.map((i) => i.id).filter(Boolean),
      );
  }
}
