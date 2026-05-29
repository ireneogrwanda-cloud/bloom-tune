// WhatsApp bot conversation logic.
// Handles onboarding state, temperature logging, and AI-powered responses.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText } from "./whatsapp.server";
import {
  parseTemperature,
  predictCycle,
  isoDate,
  type TempPoint,
} from "./fertility";

const DISCLAIMER = "ℹ️ This bot helps you track fertility patterns.";

// Map of WhatsApp country dialing code -> language name (longest prefix wins).
const COUNTRY_LANG: Array<[string, string]> = [
  ["1", "English"], ["44", "English"], ["61", "English"], ["64", "English"],
  ["353", "English"], ["27", "English"],
  ["33", "French"], ["32", "French"], ["241", "French"], ["225", "French"],
  ["49", "German"], ["43", "German"], ["41", "German"],
  ["39", "Italian"],
  ["34", "Spanish"], ["52", "Spanish"], ["54", "Spanish"], ["56", "Spanish"],
  ["57", "Spanish"], ["58", "Spanish"], ["51", "Spanish"], ["502", "Spanish"],
  ["503", "Spanish"], ["504", "Spanish"], ["505", "Spanish"], ["506", "Spanish"],
  ["351", "Portuguese"], ["55", "Portuguese"],
  ["31", "Dutch"],
  ["46", "Swedish"], ["47", "Norwegian"], ["45", "Danish"], ["358", "Finnish"],
  ["48", "Polish"], ["420", "Czech"], ["36", "Hungarian"], ["40", "Romanian"],
  ["30", "Greek"], ["90", "Turkish"], ["7", "Russian"], ["380", "Ukrainian"],
  ["972", "Hebrew"],
  ["20", "Arabic"], ["966", "Arabic"], ["971", "Arabic"], ["962", "Arabic"],
  ["961", "Arabic"], ["965", "Arabic"], ["974", "Arabic"], ["973", "Arabic"],
  ["968", "Arabic"], ["212", "Arabic"], ["213", "Arabic"], ["216", "Arabic"],
  ["98", "Persian"],
  ["91", "Hindi"], ["92", "Urdu"], ["880", "Bengali"], ["94", "Sinhala"],
  ["977", "Nepali"],
  ["86", "Chinese"], ["852", "Chinese"], ["853", "Chinese"], ["886", "Chinese"],
  ["81", "Japanese"], ["82", "Korean"],
  ["66", "Thai"], ["84", "Vietnamese"], ["62", "Indonesian"], ["60", "Malay"],
  ["63", "Filipino"],
  ["254", "Swahili"], ["255", "Swahili"], ["256", "Swahili"],
  ["234", "English"], ["233", "English"],
];

function detectLanguage(phone: string): string {
  const n = normalizePhone(phone);
  const sorted = [...COUNTRY_LANG].sort((a, b) => b[0].length - a[0].length);
  for (const [code, lang] of sorted) {
    if (n.startsWith(code)) return lang;
  }
  return "English";
}

async function translate(text: string, lang: string): Promise<string> {
  if (lang === "English" || !text.trim()) return text;
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return text;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: `Translate the following WhatsApp message into ${lang}. Preserve emojis, numbers, line breaks, and *markdown* formatting exactly. Do not add commentary, quotes, or explanations — output only the translation.\n\n---\n${text}`,
        }],
      }),
    });
    if (!res.ok) return text;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || text;
  } catch {
    return text;
  }
}


function normalizePhone(p: string): string {
  return p.replace(/[^\d]/g, "");
}

export async function findUserByPhone(phone: string) {
  const n = normalizePhone(phone);
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("whatsapp_number", n)
    .maybeSingle();
  if (error) console.error("findUserByPhone error", error);
  return data;
}

async function logInbound(userId: string | null, from: string, waId: string, body: string, raw: unknown) {
  await supabaseAdmin.from("bot_messages").insert({
    user_id: userId,
    wa_message_id: waId,
    direction: "in",
    body,
    raw: raw as any,
  });
  void from;
}

async function logOutbound(userId: string | null, body: string) {
  await supabaseAdmin.from("bot_messages").insert({
    user_id: userId,
    direction: "out",
    body,
  });
}

async function reply(userId: string | null, to: string, body: string) {
  await sendWhatsAppText(to, body);
  await logOutbound(userId, body);
}

async function getOrCreateActiveCycle(userId: string, cycleStartIso: string) {
  const { data: existing } = await supabaseAdmin
    .from("cycles")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("started_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabaseAdmin
    .from("cycles")
    .insert({ user_id: userId, started_on: cycleStartIso, status: "active" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function handleIncomingMessage(args: {
  from: string;
  waMessageId: string;
  text: string;
  raw: unknown;
}) {
  const { from, waMessageId, text, raw } = args;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  let profile = await findUserByPhone(from);
  if (!profile) {
    const n = normalizePhone(from);
    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email: `wa_${n}@bot.local`,
      email_confirm: true,
      user_metadata: { display_name: `WhatsApp ${n.slice(-4)}`, whatsapp_number: n },
    });
    if (userErr || !userData?.user) {
      console.error("auto-create auth user failed", userErr);
      await sendWhatsAppText(from, "Sorry, something went wrong setting up your account. Please try again.");
      return;
    }
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("profiles")
      .update({ whatsapp_number: n })
      .eq("id", userData.user.id)
      .select("*")
      .single();
    if (updErr || !updated) {
      console.error("auto-create profile update failed", updErr);
      await sendWhatsAppText(from, "Sorry, something went wrong setting up your account. Please try again.");
      return;
    }
    profile = updated;
    await sendWhatsAppText(
      from,
      `👋 Welcome! I've set up a new account for you.\n\n${DISCLAIMER}`,
    );
  }
  await logInbound(profile.id, from, waMessageId, trimmed, raw);



  // Commands
  if (lower === "help" || lower === "/help") {
    await reply(
      profile.id,
      from,
      [
        "📋 Commands:",
        "• Send a number (e.g. 36.7) to log today's basal temperature",
        "• *status* — your current cycle day & fertility window",
        "• *reset cycle* — mark today as day 1 of a new cycle",
        "• *help* — show this menu",
        "",
        DISCLAIMER,
      ].join("\n"),
    );
    return;
  }

  if (lower === "reset cycle" || lower === "new cycle" || lower === "period started") {
    const today = isoDate(new Date());
    // Close existing
    await supabaseAdmin
      .from("cycles")
      .update({ status: "completed", ended_on: today })
      .eq("user_id", profile.id)
      .eq("status", "active");
    const { data: cycle } = await supabaseAdmin
      .from("cycles")
      .insert({ user_id: profile.id, started_on: today, status: "active" })
      .select("*")
      .single();
    await reply(
      profile.id,
      from,
      `🩸 New cycle started on ${today}. I'll predict your fertile window based on your ${profile.avg_cycle_length}-day average. Send your daily BBT to refine it.`,
    );
    void cycle;
    return;
  }

  if (lower === "status") {
    await sendStatus(profile, from);
    return;
  }

  // Try parsing a temperature
  const temp = parseTemperature(trimmed);
  if (temp !== null) {
    await handleTempLog(profile, from, temp);
    return;
  }

  // Fallback: friendly hint
  await reply(
    profile.id,
    from,
    `I didn't catch a temperature in that. Send a number like *36.7* to log today's BBT, or *help* for commands.\n\n${DISCLAIMER}`,
  );
}

async function sendStatus(profile: any, from: string) {
  const cycle = await getOrCreateActiveCycle(profile.id, isoDate(new Date()));
  const { data: logs } = await supabaseAdmin
    .from("temperature_logs")
    .select("logged_for, temp_celsius")
    .eq("cycle_id", cycle.id)
    .order("logged_for");

  const cycleStart = new Date(cycle.started_on);
  const temps: TempPoint[] =
    (logs ?? []).map((l) => ({
      day: Math.floor(
        (new Date(l.logged_for).getTime() - cycleStart.getTime()) / 86400000,
      ) + 1,
      temp: Number(l.temp_celsius),
      date: l.logged_for,
    }));

  const stats = predictCycle({
    cycleStart,
    today: new Date(),
    avgCycleLength: profile.avg_cycle_length,
    periodLength: profile.period_length,
    temps,
  });

  const ovText = stats.ovulationConfirmed
    ? `Ovulation appears to have occurred around cycle day ${stats.estimatedOvulationDay} (confirmed by temperature rise).`
    : `Estimated ovulation: cycle day ${stats.estimatedOvulationDay} (calendar prediction — log more temps to confirm).`;

  await reply(
    profile.id,
    from,
    [
      `📊 *Status* — cycle started ${cycle.started_on}`,
      stats.message,
      "",
      `🌱 Fertile window: cycle days ${stats.fertileStartDay}–${stats.fertileEndDay}`,
      ovText,
      `📈 Logs this cycle: ${temps.length}`,
      "",
      DISCLAIMER,
    ].join("\n"),
  );
}

async function handleTempLog(profile: any, from: string, temp: number) {
  const today = isoDate(new Date());
  const cycle = await getOrCreateActiveCycle(profile.id, today);

  // Upsert today's log
  const { error: upErr } = await supabaseAdmin
    .from("temperature_logs")
    .upsert(
      {
        user_id: profile.id,
        cycle_id: cycle.id,
        logged_for: today,
        temp_celsius: temp,
        source: "whatsapp",
      },
      { onConflict: "user_id,logged_for" },
    );
  if (upErr) {
    console.error("upsert temp error", upErr);
    await reply(profile.id, from, "Sorry, I couldn't save that. Please try again.");
    return;
  }

  // Build prediction with all logs in this cycle
  const { data: logs } = await supabaseAdmin
    .from("temperature_logs")
    .select("logged_for, temp_celsius")
    .eq("cycle_id", cycle.id)
    .order("logged_for");

  const cycleStart = new Date(cycle.started_on);
  const temps: TempPoint[] =
    (logs ?? []).map((l) => ({
      day: Math.floor(
        (new Date(l.logged_for).getTime() - cycleStart.getTime()) / 86400000,
      ) + 1,
      temp: Number(l.temp_celsius),
      date: l.logged_for,
    }));

  const stats = predictCycle({
    cycleStart,
    today: new Date(),
    avgCycleLength: profile.avg_cycle_length,
    periodLength: profile.period_length,
    temps,
  });

  // Update cycle prediction
  await supabaseAdmin
    .from("cycles")
    .update({
      ovulation_day: stats.estimatedOvulationDay,
    })
    .eq("id", cycle.id);

  const aiText = await generateAiCommentary({
    temp,
    cycleDay: stats.cycleDay,
    status: stats.status,
    ovulationDay: stats.estimatedOvulationDay,
    fertileStart: stats.fertileStartDay,
    fertileEnd: stats.fertileEndDay,
    ovulationConfirmed: stats.ovulationConfirmed,
    recentTemps: temps.slice(-7),
  });

  const body = [
    `✅ Logged ${temp.toFixed(2)}°C for cycle day ${stats.cycleDay}.`,
    "",
    stats.message,
    "",
    `🌱 Fertile window: days ${stats.fertileStartDay}–${stats.fertileEndDay}`,
    "",
    aiText,
    "",
    DISCLAIMER,
  ].join("\n");

  await reply(profile.id, from, body);
}

async function generateAiCommentary(input: {
  temp: number;
  cycleDay: number;
  status: string;
  ovulationDay: number;
  fertileStart: number;
  fertileEnd: number;
  ovulationConfirmed: boolean;
  recentTemps: TempPoint[];
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return "";
  try {
    const prompt = `You are a friendly fertility-tracking assistant on WhatsApp. The user just logged a basal body temperature.

Data:
- Temp today: ${input.temp}°C
- Cycle day: ${input.cycleDay}
- Phase: ${input.status}
- Estimated ovulation day: ${input.ovulationDay} (${input.ovulationConfirmed ? "confirmed by BBT rise" : "calendar estimate"})
- Fertile window: days ${input.fertileStart}–${input.fertileEnd}
- Last 7 temps: ${input.recentTemps.map((t) => `d${t.day}:${t.temp}`).join(", ") || "none"}

Write a 2-3 sentence warm, practical interpretation. No medical claims. No emojis at the start. Do not repeat the numbers verbatim — interpret what they mean for fertility today and what to expect next. Plain text only.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error("AI commentary failed", res.status, await res.text());
      return "";
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text ? `💬 ${text}` : "";
  } catch (e) {
    console.error("AI commentary error", e);
    return "";
  }
}
