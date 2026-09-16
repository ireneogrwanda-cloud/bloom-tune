import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Translate a batch of interface strings. Used by the app-wide language
 * switcher so every screen can speak the user's own language.
 */
export const translateUi = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        lang: z.string().min(2).max(40),
        texts: z.array(z.string().min(1).max(1200)).min(1).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<string[]> => {
    if (data.lang === "English") return data.texts;
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return data.texts;

    const prompt = `Translate every string in this JSON array into ${data.lang}.
Rules:
- Return ONLY a JSON array of the same length, in the same order.
- Keep emojis, numbers, dates, °C values and {placeholders} exactly as they are.
- Use natural, warm, everyday language a woman tracking her cycle would understand.
- This is a fertility / menstrual cycle tracking app, translate the terms accordingly.

${JSON.stringify(data.texts)}`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) return data.texts;
      const json: any = await res.json();
      const raw: string = json?.choices?.[0]?.message?.content ?? "";
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return data.texts;
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed) || parsed.length !== data.texts.length) return data.texts;
      return parsed.map((v, i) => (typeof v === "string" && v.trim() ? v : data.texts[i]!));
    } catch {
      return data.texts;
    }
  });

/**
 * Remember the chosen language on the profile so the WhatsApp bot replies in
 * the same language as the app.
 */
export const setAppLanguage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ lang: z.string().min(2).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("bot_state").eq("id", userId).maybeSingle();
    const botState = { ...((profile?.bot_state as Record<string, unknown>) ?? {}), language: data.lang };
    await supabase.from("profiles").update({ bot_state: botState }).eq("id", userId);
    return { ok: true };
  });
