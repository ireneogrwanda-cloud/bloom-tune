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
