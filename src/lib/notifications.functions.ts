import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export const listNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { todayIso?: string }) =>
    z.object({ todayIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { syncNotificationsFor, todayIsoFor } = await import("@/lib/notifications.server");
    try {
      await syncNotificationsFor(supabase, userId, data.todayIso ?? todayIsoFor());
    } catch (e) {
      console.error("notification sync failed", e);
    }
    const { data: rows, error } = await supabase
      .from("notifications")
      .select("id, kind, title, body, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return (rows ?? []) as AppNotification[];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids?: string[] }) => z.object({ ids: z.array(z.string().uuid()).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    if (data.ids?.length) q = q.in("id", data.ids);
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  });

export const registerPushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string; platform?: string }) =>
    z.object({ token: z.string().min(10).max(4096), platform: z.string().max(20).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_tokens")
      .upsert(
        { user_id: userId, token: data.token, platform: data.platform ?? "web", last_seen_at: new Date().toISOString() },
        { onConflict: "token" },
      );
    if (error) throw error;
    return { ok: true };
  });
