import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ChatMessage = {
  id: string;
  direction: "in" | "out";
  body: string | null;
  imageUrl?: string | null;
  createdAt: string;
};

export const getChatHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChatMessage[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("bot_messages")
      .select("id, direction, body, media_url, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((m) => ({
      id: m.id,
      direction: m.direction as "in" | "out",
      body: m.body,
      imageUrl: m.media_url,
      createdAt: m.created_at,
    }));
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ text: z.string().trim().min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!profile) throw new Error("Profile not found");

    const { handleIncomingMessage } = await import("./bot.server");
    const capture: { text?: string; imageUrl?: string }[] = [];
    await handleIncomingMessage({
      from: profile.whatsapp_number ? `+${profile.whatsapp_number}` : "+00000000000",
      waMessageId: `web-${Date.now()}`,
      text: data.text,
      raw: { source: "web" },
      capture,
      profileOverride: profile,
    });
    return { messages: capture };
  });

/**
 * Log a temperature from the web app through the bot, so the user gets the exact
 * same guidance WhatsApp would send. The reply is stored in the chat thread and
 * also raised as an in-app notification.
 */
export const logTemperatureViaBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        loggedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        tempCelsius: z.number().min(35).max(38),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!profile) throw new Error("Profile not found");

    const { data: cycle } = await supabase
      .from("cycles")
      .select("id, started_on")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("started_on", { ascending: false })
      .maybeSingle();

    let text = data.tempCelsius.toFixed(2);
    if (cycle?.started_on) {
      const start = new Date(`${cycle.started_on}T00:00:00Z`).getTime();
      const day = Math.round((new Date(`${data.loggedFor}T00:00:00Z`).getTime() - start) / 86400000) + 1;
      if (day >= 1) text = `d${day} ${data.tempCelsius.toFixed(2)}`;
    }

    const { handleIncomingMessage } = await import("./bot.server");
    const capture: { text?: string; imageUrl?: string }[] = [];
    await handleIncomingMessage({
      from: profile.whatsapp_number ? `+${profile.whatsapp_number}` : "+00000000000",
      waMessageId: `web-temp-${Date.now()}`,
      text,
      raw: { source: "web-dashboard" },
      capture,
      profileOverride: profile,
    });

    const note = capture.map((m) => m.text).filter(Boolean).join("\n\n").trim();
    if (note) {
      await supabase.from("notifications").insert({
        user_id: userId,
        kind: "bbt_logged",
        title: `Temperature logged · ${data.tempCelsius.toFixed(2)}°C`,
        body: note.length > 220 ? `${note.slice(0, 217)}…` : note,
        dedupe_key: `bbt-logged:${data.loggedFor}:${Date.now()}`,
      });
    }
    return { messages: capture, note };
  });
