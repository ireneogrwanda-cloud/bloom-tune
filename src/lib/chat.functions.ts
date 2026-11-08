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
    // Take the NEWEST 200 messages, then flip them back into reading order.
    // (Ascending + limit would pin the thread to the oldest messages, so new
    // replies would never show up once the history grew past the limit.)
    const { data, error } = await supabase
      .from("bot_messages")
      .select("id, direction, body, media_url, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).reverse().map((m) => ({
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

    const [{ handleIncomingMessage }, { withBotDatabase }] = await Promise.all([
      import("./bot.server"),
      import("./bot-context.server"),
    ]);
    const capture: { text?: string; imageUrl?: string }[] = [];
    await withBotDatabase(supabase, () => handleIncomingMessage({
      from: profile.whatsapp_number ? `+${profile.whatsapp_number}` : "+00000000000",
      waMessageId: `web-${Date.now()}`,
      text: data.text,
      raw: { source: "web" },
      capture,
      profileOverride: profile,
    }));
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
        // Answers to the "does this reading count?" questions asked in the app.
        sick: z.boolean().optional(),
        disruptedMorning: z.boolean().optional(),
        requestId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const todayIso = new Date().toISOString().slice(0, 10);
    if (data.loggedFor > todayIso) {
      throw new Error("You can only log a temperature for today or an earlier day.");
    }
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!profile) throw new Error("Profile not found");
    const messageId = data.requestId ? `web-temp-${data.requestId}` : `web-temp-${Date.now()}`;
    if (data.requestId) {
      const { data: processed } = await supabase.from("bot_messages").select("id")
        .eq("user_id", userId).eq("wa_message_id", messageId).limit(1).maybeSingle();
      if (processed) return { messages: [], note: "" };
    }

    const { data: cycle } = await supabase
      .from("cycles")
      .select("id, started_on")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("started_on", { ascending: false })
      .maybeSingle();

    // Find the cycle this date belongs to (could be a past, closed cycle).
    const { data: owning } = await supabase
      .from("cycles")
      .select("id, started_on, ended_on, status")
      .eq("user_id", userId)
      .lte("started_on", data.loggedFor)
      .order("started_on", { ascending: false })
      .limit(1)
      .maybeSingle();

    const excluded = !!data.sick || !!data.disruptedMorning;
    // Always save the reading on the exact day tapped, so the calendar never loses it.
    const { error: upErr } = await supabase.from("temperature_logs").upsert(
      {
        user_id: userId,
        logged_for: data.loggedFor,
        temp_celsius: data.tempCelsius,
        cycle_id: owning?.id ?? null,
        source: "web",
        excluded,
        exclude_reason: data.sick ? "fever-or-illness" : data.disruptedMorning ? "disrupted-morning" : null,
      },
      { onConflict: "user_id,logged_for" },
    );
    if (upErr) throw new Error(upErr.message);

    // Only ask the bot for guidance when the day is in the current cycle.
    if (!cycle?.started_on || data.loggedFor < cycle.started_on) {
      return { messages: [], note: "" };
    }
    const start = new Date(`${cycle.started_on}T00:00:00Z`).getTime();
    const day = Math.round((new Date(`${data.loggedFor}T00:00:00Z`).getTime() - start) / 86400000) + 1;
    const text = `d${day} ${data.tempCelsius.toFixed(2)}`;

    const capture: { text?: string; imageUrl?: string }[] = [];
    try {
      const [{ handleIncomingMessage, prepareWebTempFlags }, { withBotDatabase }] = await Promise.all([
        import("./bot.server"),
        import("./bot-context.server"),
      ]);
      await withBotDatabase(supabase, async () => {
        const botState = await prepareWebTempFlags(profile, data.loggedFor, {
          sick: !!data.sick,
          disrupted: !!data.disruptedMorning,
        });
        await handleIncomingMessage({
          from: profile.whatsapp_number ? `+${profile.whatsapp_number}` : "+00000000000",
          waMessageId: messageId,
          text,
          raw: { source: "web-dashboard" },
          capture,
          profileOverride: { ...profile, bot_state: botState },
        });
      });
    } catch (e) {
      console.error("bot note failed", e);
    }

    const note = capture.map((m) => m.text).filter(Boolean).join("\n\n").trim();
    if (note) {
      await supabase.from("notifications").insert({
        user_id: userId,
        kind: "bbt_logged",
        title: `Temperature logged · ${data.tempCelsius.toFixed(2)}°C`,
        body: note.length > 220 ? `${note.slice(0, 217)}…` : note,
        dedupe_key: `bbt-logged:${data.loggedFor}:${data.requestId ?? Date.now()}`,
      });
    }
    return { messages: capture, note };
  });
