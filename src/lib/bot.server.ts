// WhatsApp bot conversation logic.
// Handles onboarding state, temperature logging, and AI-powered responses.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText, sendWhatsAppImage } from "./whatsapp.server";
import {
  parseTemperature,
  predictCycle,
  isoDate,
  addDays,
  daysBetween,
  type TempPoint,
  type CycleStats,
} from "./fertility";

// Fetch lengths of completed past cycles (most-recent first, capped at 12).
async function getCycleHistory(userId: string): Promise<number[]> {
  const { data } = await supabaseAdmin
    .from("cycles")
    .select("started_on, ended_on")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("ended_on", "is", null)
    .order("started_on", { ascending: false })
    .limit(12);
  if (!data) return [];
  return data
    .map((c) => {
      const start = new Date(c.started_on).getTime();
      const end = new Date(c.ended_on as string).getTime();
      return Math.round((end - start) / 86_400_000);
    })
    .filter((n) => n >= 20 && n <= 45);
}

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
  ["250", "Kinyarwanda"],
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

// Resolve a user's preferred language: explicit override in bot_state wins,
// otherwise fall back to phone-based detection.
function userLang(profile: any, phone: string): string {
  const override = profile?.bot_state?.language;
  if (typeof override === "string" && override.trim()) return override;
  return detectLanguage(phone);
}

function readBotState(profile: any): Record<string, unknown> {
  return profile?.bot_state && typeof profile.bot_state === "object" && !Array.isArray(profile.bot_state)
    ? (profile.bot_state as Record<string, unknown>)
    : {};
}

const COUNTRY_TIMEZONE: Array<[string, string]> = [
  ["250", "Africa/Kigali"], ["254", "Africa/Nairobi"], ["255", "Africa/Dar_es_Salaam"], ["256", "Africa/Kampala"],
  ["234", "Africa/Lagos"], ["233", "Africa/Accra"], ["27", "Africa/Johannesburg"], ["20", "Africa/Cairo"],
  ["33", "Europe/Paris"], ["32", "Europe/Brussels"], ["44", "Europe/London"], ["49", "Europe/Berlin"],
  ["39", "Europe/Rome"], ["34", "Europe/Madrid"], ["31", "Europe/Amsterdam"], ["1", "America/New_York"],
  ["55", "America/Sao_Paulo"], ["52", "America/Mexico_City"], ["91", "Asia/Kolkata"], ["86", "Asia/Shanghai"],
  ["81", "Asia/Tokyo"], ["82", "Asia/Seoul"], ["61", "Australia/Sydney"], ["971", "Asia/Dubai"],
];

function phoneTimezone(phone: string): string {
  const n = normalizePhone(phone);
  const sorted = [...COUNTRY_TIMEZONE].sort((a, b) => b[0].length - a[0].length);
  return sorted.find(([code]) => n.startsWith(code))?.[1] ?? "UTC";
}

function localDateHour(date: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) };
}

// Parse a free-text language command. Returns the canonical language name or null.
function parseLanguageCommand(text: string, phone: string): string | null {
  const t = text.trim().toLowerCase();
  const m = t.match(/^(?:lang|language|ururimi|langue)\s+(.+)$/);
  if (!m) return null;
  const v = m[1].trim();
  if (/^(en|eng|english|icyongereza|anglais)$/.test(v)) return "English";
  if (/^(fr|fre|fra|french|igifaransa|francais|français)$/.test(v)) return "French";
  if (/^(local|native|home|mine|my\s+language)$/.test(v)) return detectLanguage(phone);
  // Title-case anything else and accept it (e.g. "Spanish", "Kinyarwanda")
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

const LANG_STYLE: Record<string, string> = {
  Kinyarwanda: `STYLE GUIDE for Kinyarwanda — produce natural, grammatically perfect Kinyarwanda. Follow these conventions EXACTLY:

Vocabulary mapping:
- temperature → "ubushyuhe bw'umubiri" (or keep "temperature" when natural)
- "You measured 36.64°C on day 2" → "Wapimye 36.64°C ku munsi wa 2"
- cycle / month → "ukwezi" (NOT "ikizinga")
- cycle day N → "umunsi wa N w'ukwezi"
- period / menstruation → "imihango"
- "day N of your period" → "umunsi wa N w'imihango yawe"
- fertile / fertility → "uburumbuke" / "kurumbuka"
- fertile window → "Igihe cyo kurumbuka"
- infertile → "Ntabwo urumbuka"
- ovulation → "ukumanuka kw'intanga" or "gusama"
- "ovulation expected on day X" → "Ukumanuka kw'intanga biteganijwe: ku munsi wa X"
- next period → "Imihango itaha iteganijwe"
- date → "italiki" or use the date directly
- low fertility → "uburumbuke buri hasi"

Emojis (KEEP exactly): ✅ 🔴 🟢 🥚 🩸 💬 ℹ️

Tone: warm, respectful, second-person singular ("wawe", "uri"), like a caring health companion. Use natural flowing sentences, NOT robotic word-for-word translation.

GOLD-STANDARD EXAMPLE (this is the target quality and phrasing):
"""
✅ Wapimye 36.64°C ku munsi wa 2 w'ukwezi (2026-05-30).

Uri ku munsi wa 2 w'imihango yawe. Uburumbuke buri hasi cyane ubu.

🔴 Igihe cyo kurumbuka: giteganijwe hagati y'umunsi 9–15 yu kwezi kwawe.

🟢 Ntabwo urumbuka: iminsi isigaye y'ukwezi

🥚 Ukumanuka kw'intanga biteganijwe: ku munsi wa 14 (2026-06-11)

🩸 Imihango itaha iteganijwe: 2026-06-26

💬 Ubushyuhe bwawe buri hasi, nk'uko bisanzwe iyo uri mu mihango, ibi bikaba bisanzwe kuko umubiri wawe uba witegura ukwezi gushya. Kubera ko uri mu gihe cy'imihango, uburumbuke bwawe buri hasi. Mu cyumweru gitaha, ushobora kwitega ko ubushyuhe buzakomeza kuba hamwe mbere yuko igihe cyo cy'uburumbuke gitangira.

ℹ️ Iyi bot igufasha gukurikirana imiterere y'uburumbuke.
"""

Match this phrasing style, vocabulary, and flow whenever the source content is similar.`,
};

async function translate(text: string, lang: string): Promise<string> {
  if (lang === "English" || !text.trim()) return text;
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return text;
  const styleGuide = LANG_STYLE[lang];
  const prompt = styleGuide
    ? `Translate the following WhatsApp message into ${lang}, following this style guide strictly:\n\n${styleGuide}\n\nPreserve emojis, numbers, line breaks, and *markdown* formatting. Do not add commentary, quotes, or explanations — output only the translation.\n\n---\n${text}`
    : `Translate the following WhatsApp message into ${lang}. Preserve emojis, numbers, line breaks, and *markdown* formatting exactly. Do not add commentary, quotes, or explanations — output only the translation.\n\n---\n${text}`;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
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

async function reply(profile: any, to: string, body: string) {
  const translated = await translate(body, userLang(profile, to));
  await sendWhatsAppText(to, translated);
  await logOutbound(profile?.id ?? null, translated);
}

async function replyImage(profile: any, to: string, imageUrl: string, caption?: string) {
  const cap = caption ? await translate(caption, userLang(profile, to)) : undefined;
  await sendWhatsAppImage(to, imageUrl, cap);
  if (cap) await logOutbound(profile?.id ?? null, `[chart] ${cap}`);
}

// Parse an optional date alongside a temperature. Accepts:
//   "36.7"                          → today
//   "36.7 d5" / "day 5 36.7"        → cycle day 5
//   "36.7 2026-06-01"               → that ISO date
//   "36.7 01/06" / "36.7 01/06/2026"→ DD/MM[/YYYY]
//   "36.7 yesterday" / "36.7 today" → relative day
function parseTempAndDay(text: string): { temp: number; day?: number; date?: string } | null {
  const temp = parseTemperature(text);
  if (temp === null) return null;
  const t = text.trim();

  // Cycle-day form. Keep parsing after this so a message can include both
  // a cycle day and a date, e.g. "36.7 d14 2026-06-15".
  const dayMatch = t.match(/\b(?:d|day|cycle\s*day)\s*(\d{1,2})\b/i);
  const day = dayMatch ? Math.max(1, Math.min(60, parseInt(dayMatch[1], 10))) : undefined;

  let date: string | undefined;

  // Relative day
  if (/\b(today|now)\b/i.test(t)) date = isoDate(new Date());
  if (/\b(yesterday)\b/i.test(t)) date = isoDate(addDays(new Date(), -1));

  // ISO date YYYY-MM-DD
  const iso = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`);
    if (!isNaN(d.getTime())) date = isoDate(d);
  }

  // DD/MM or DD/MM/YYYY (also accepts DD-MM-YYYY / DD.MM.YYYY)
  const dmy = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  if (dmy) {
    const dd = parseInt(dmy[1], 10);
    const mm = parseInt(dmy[2], 10);
    let yyyy = dmy[3] ? parseInt(dmy[3], 10) : new Date().getFullYear();
    if (yyyy < 100) yyyy += 2000;
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      const d = new Date(`${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`);
      if (!isNaN(d.getTime())) date = isoDate(d);
    }
  }

  if (dayMatch) {
    return date ? { temp, day, date } : { temp, day };
  }

  return date ? { temp, date } : { temp };
}

// Parse a date out of free-text (no temperature required). Accepts ISO,
// DD/MM[/YYYY], "today", "yesterday", or "N days ago".
function parseDateOnly(text: string): string | null {
  const t = text.trim();
  if (/^\s*today\s*$/i.test(t) || /\bnow\b/i.test(t)) return isoDate(new Date());
  if (/^\s*yesterday\s*$/i.test(t) || /\byesterday\b/i.test(t)) return isoDate(addDays(new Date(), -1));
  const ago = t.match(/\b(\d{1,2})\s*(?:days?|d)\s*ago\b/i);
  if (ago) {
    const n = parseInt(ago[1], 10);
    if (n >= 0 && n <= 60) return isoDate(addDays(new Date(), -n));
  }
  const iso = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return isoDate(d);
  }
  const dmy = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  if (dmy) {
    const dd = parseInt(dmy[1], 10);
    const mm = parseInt(dmy[2], 10);
    let yyyy = dmy[3] ? parseInt(dmy[3], 10) : new Date().getFullYear();
    if (yyyy < 100) yyyy += 2000;
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      const d = new Date(`${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`);
      if (!isNaN(d.getTime())) return isoDate(d);
    }
  }
  return null;
}

// Build a public chart image URL using QuickChart (Chart.js renderer).
// Green = infertile days, Red = fertile window, dashed line = ovulation.
function buildChartUrl(args: {
  avgCycleLength: number;
  periodLength: number;
  temps: TempPoint[];
  stats: CycleStats;
}): string {
  const { avgCycleLength, periodLength, temps, stats } = args;
  const totalDays = Math.max(avgCycleLength, stats.cycleDay, 28);
  const labels = Array.from({ length: totalDays }, (_, i) => i + 1);
  const data = labels.map((d) => {
    const t = temps.find((p) => p.day === d);
    return t ? t.temp : null;
  });
  // Only paint a day GREEN when the algorithm is highly confident it's safe.
  // When evidence is missing we err on the side of caution and paint RED —
  // better to treat an uncertain day as fertile than to mislabel it as safe.
  //  - pre-fertile days require ≥3 completed cycles of history (current-cycle
  //    BBT confirmation says nothing about how early the fertile window opens)
  //  - post-fertile days require BBT-confirmed ovulation AND past the buffer
  const preFertileConfirmed = stats.cyclesAnalyzed >= 3;
  const postFertileConfirmed = stats.fertileWindowClosed;
  const pointColors = labels.map((d) => {
    if (d >= stats.fertileStartDay && d <= stats.fertileEndDay) return "rgb(220,38,38)"; // fertile - red
    if (d <= periodLength) return "rgb(22,163,74)"; // bleeding - safe
    if (d < stats.fertileStartDay) return preFertileConfirmed ? "rgb(22,163,74)" : "rgb(220,38,38)";
    return postFertileConfirmed ? "rgb(22,163,74)" : "rgb(220,38,38)";
  });

  const cfg = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "BBT (°C)",
          data,
          borderColor: "rgb(30,64,175)",
          backgroundColor: "rgba(30,64,175,0.15)",
          spanGaps: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: pointColors,
          pointBorderColor: "white",
          pointBorderWidth: 1.5,
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: `Cycle overview — day ${stats.cycleDay} of ~${avgCycleLength}` },
        legend: { display: false },
        annotation: {
          annotations: {
            periodBox: {
              type: "box",
              xMin: 0.5,
              xMax: periodLength + 0.5,
              backgroundColor: "rgba(190,18,60,0.18)",
              borderWidth: 0,
              label: { display: true, content: "Period", position: "start", color: "#9f1239" },
            },
            preFertile: {
              type: "box",
              xMin: periodLength + 0.5,
              xMax: stats.fertileStartDay - 0.5,
              backgroundColor: preFertileConfirmed ? "rgba(34,197,94,0.22)" : "rgba(239,68,68,0.22)",
              borderWidth: 0,
              label: {
                display: true,
                content: preFertileConfirmed ? "Infertile" : "Treat as fertile",
                position: "center",
                color: preFertileConfirmed ? "#166534" : "#991b1b",
              },
            },
            fertile: {
              type: "box",
              xMin: stats.fertileStartDay - 0.5,
              xMax: stats.fertileEndDay + 0.5,
              backgroundColor: "rgba(239,68,68,0.3)",
              borderWidth: 0,
              label: { display: true, content: "Fertile", position: "center", color: "#991b1b" },
            },
            postFertile: {
              type: "box",
              xMin: stats.fertileEndDay + 0.5,
              xMax: totalDays + 0.5,
              backgroundColor: postFertileConfirmed ? "rgba(34,197,94,0.22)" : "rgba(239,68,68,0.22)",
              borderWidth: 0,
              label: {
                display: true,
                content: postFertileConfirmed ? "Infertile" : "Treat as fertile",
                position: "center",
                color: postFertileConfirmed ? "#166534" : "#991b1b",
              },
            },
            ovulation: {
              type: "line",
              xMin: stats.estimatedOvulationDay,
              xMax: stats.estimatedOvulationDay,
              borderColor: "rgb(220,38,38)",
              borderWidth: 2,
              borderDash: [6, 4],
              label: { display: true, content: "Ovulation", position: "end", color: "#991b1b" },
            },
            today: {
              type: "line",
              xMin: stats.cycleDay,
              xMax: stats.cycleDay,
              borderColor: "rgb(15,23,42)",
              borderWidth: 1,
              borderDash: [2, 2],
              label: { display: true, content: "Today", position: "start", color: "#0f172a" },
            },
          },
        },
      },
      scales: {
        y: { min: 35.5, max: 37.5, title: { display: true, text: "°C" } },
        x: { title: { display: true, text: "Cycle day" } },
      },
    },
  };
  const json = JSON.stringify(cfg);
  return `https://quickchart.io/chart?w=720&h=420&bkg=white&v=4&c=${encodeURIComponent(json)}`;
}

// QuickChart "create" endpoint returns a short, permanent URL. Twilio's media
// URL field is capped at 4000 chars; the inline `?c=` GET URL frequently
// exceeds that for long cycles, causing a 413 send failure (the bot then
// appears "stuck" because the WhatsApp reply never goes out).
async function shortenChartUrl(longUrl: string): Promise<string> {
  if (longUrl.length <= 3500) return longUrl;
  try {
    const c = decodeURIComponent(longUrl.split("c=")[1] ?? "");
    const res = await fetch("https://quickchart.io/chart/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chart: c, width: 720, height: 420, backgroundColor: "white", version: "4" }),
    });
    if (!res.ok) return longUrl;
    const json = (await res.json()) as { url?: string };
    return json.url ?? longUrl;
  } catch (e) {
    console.error("shortenChartUrl failed", e);
    return longUrl;
  }
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
      await sendWhatsAppText(from, await translate("Sorry, something went wrong setting up your account. Please try again.", detectLanguage(from)));
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
      await sendWhatsAppText(from, await translate("Sorry, something went wrong setting up your account. Please try again.", detectLanguage(from)));
      return;
    }
    profile = updated;
    const initialState = { awaiting_period_start: true };
    await supabaseAdmin.from("profiles").update({ bot_state: initialState }).eq("id", profile.id);
    profile.bot_state = initialState;
    const welcome = `👋 Welcome! I've set up a new account for you.

ℹ️ This bot helps you track fertility patterns.

⏰ I'll send a reminder at *6:00 a.m. your local time* so you can log your BBT before getting out of bed.

🛡️ For contraception: use protection on 🔴 red days. No protection is needed on 🟢 green days.

🌐 *Language:* I'll reply in your local language by default. Type *lang english*, *lang french*, or *lang local* anytime to switch.

🌡️ *How to use a BBT (basal body thermometer) properly:*
• Use a dedicated BBT thermometer (0.01°C precision), not a regular fever one.
• Take your temperature *first thing in the morning*, before getting out of bed, talking, drinking, or even sitting up.
• Measure at roughly the *same time every day* (within ~30 min).
• Aim for at least *4–5 hours of uninterrupted sleep* before measuring.
• Measure the same way every day — orally (under the tongue), vaginally, or rectally — don't mix methods.

📅 *First, let's anchor your cycle:* what date did your *last period start* (day 1 of bleeding)?
Reply with a date — e.g. *2026-06-01*, *01/06*, *yesterday*, *today*, or *5 days ago*.

Once that's set, just send your morning temperature (e.g. *36.7*) each day. Type *help* anytime.`;
    await sendWhatsAppText(from, await translate(welcome, detectLanguage(from)));
    await logInbound(profile.id, from, waMessageId, trimmed, raw);
    return;
  }
  await logInbound(profile.id, from, waMessageId, trimmed, raw);




  // Commands
  if (lower === "help" || lower === "/help") {
    await reply(
      profile,
      from,
      [
        "📋 Commands:",
        "• Send a number (e.g. *36.7*) to log today's basal temperature",
        "• Add a date or day, e.g. *36.7 2026-06-01*, *36.7 01/06*, *36.7 yesterday*, or *36.7 d5*",
        "• *status* — current cycle day, fertile window, and chart",
        "• *chart* — send your cycle chart now",
        "• *reset cycle* — mark today as day 1 of a new cycle",
        "• *lang english* / *lang french* / *lang local* — change reply language",
        "• *help* — show this menu",
        "",
        "⏰ I'll remind you at *6:00 a.m. your local time* to log your BBT.",
        "🛡️ For contraception: use protection on 🔴 red days. No protection is needed on 🟢 green days.",
        "",
        "🌡️ *How to use a BBT thermometer effectively*",
        "Basal Body Temperature is your body's lowest resting temperature. It's tiny — measured to hundredths of a degree (e.g. 36.22°C) — so accuracy depends on routine.",
        "",
        "✅ *Do*",
        "• Use a dedicated *BBT thermometer* (reads to 0.01°C / 0.05°F)",
        "• Measure *immediately on waking*, before moving, talking, or drinking",
        "• Take it at the *same time every day* (±30 minutes)",
        "• Sleep at least *3–5 hours uninterrupted* before measuring",
        "• Use the *same site* every day (oral, vaginal, OR rectal — don't switch)",
        "",
        "❌ *Don't*",
        "• Don't get out of bed, sit up, or stretch first",
        "• Don't eat, drink, chew gum, talk, or brush teeth before measuring",
        "• Don't use a regular fever thermometer — not precise enough",
        "• Don't measure after broken sleep, alcohol, fever, illness, or jet lag (it skews the reading — note it but expect noise)",
        "",
        "⚠️ *Important*",
        "• BBT alone is one of the *less reliable* natural methods. For contraception, combine it with cervical mucus tracking (symptothermal method).",
        "• BBT does *not* protect against STIs.",
        "• Hard to use with *very irregular cycles* or shift-work sleep schedules.",
        "",
        "ℹ️ This bot helps you track fertility patterns.",

      ].join("\n"),
    );
    return;
  }

  // Language preference
  const langPick = parseLanguageCommand(trimmed, from);
  if (langPick) {
    const prev = readBotState(profile);
    const nextState = { ...prev, language: langPick };
    await supabaseAdmin.from("profiles").update({ bot_state: nextState }).eq("id", profile.id);
    profile = { ...profile, bot_state: nextState };
    await reply(profile, from, `🌐 Language set to ${langPick}. I'll reply in ${langPick} from now on. Type *lang local* to switch back to your local language.`);
    return;
  }

  // Onboarding: waiting for the user's last-period start date.
  const botState = readBotState(profile);
  if (botState.awaiting_period_start) {
    const pendingParsed = parseTempAndDay(trimmed);
    if (pendingParsed) {
      const nextState = {
        ...botState,
        awaiting_period_start: true,
        pending_temp: pendingParsed.temp,
        pending_day: pendingParsed.day,
        pending_logged_for: pendingParsed.date ?? isoDate(new Date()),
      };
      await supabaseAdmin.from("profiles").update({ bot_state: nextState }).eq("id", profile.id);
      await reply(
        profile,
        from,
        `✅ I received ${pendingParsed.temp.toFixed(2)}°C${pendingParsed.day ? ` for cycle day ${pendingParsed.day}` : ""}.

📅 Before I save it, what date was the *first day of your period* (day 1 of bleeding)? This lets me correct your cycle days and chart.

Reply with a date like *2026-06-01*, *01/06*, *yesterday*, *today*, or *5 days ago*.`,
      );
      return;
    }
    const parsedDate = parseDateOnly(trimmed);
    if (!parsedDate) {
      await reply(
        profile,
        from,
        "📅 I still need to know when your *last period started* (day 1 of bleeding). Reply with a date like *2026-06-01*, *01/06*, *yesterday*, *today*, or *5 days ago*.",
      );
      return;
    }
    const { data: activeCycle } = await supabaseAdmin
      .from("cycles")
      .select("id")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .order("started_on", { ascending: false })
      .maybeSingle();
    if (activeCycle) {
      await supabaseAdmin.from("cycles").update({ started_on: parsedDate, ended_on: null, status: "active" }).eq("id", activeCycle.id);
    } else {
      await supabaseAdmin.from("cycles").insert({ user_id: profile.id, started_on: parsedDate, status: "active" });
    }
    const pendingTemp = typeof botState.pending_temp === "number" ? botState.pending_temp : null;
    const pendingDay = typeof botState.pending_day === "number" ? botState.pending_day : null;
    const pendingDate = typeof botState.pending_logged_for === "string" ? botState.pending_logged_for : null;
    const nextState = {
      ...botState,
      awaiting_period_start: false,
      pending_temp: undefined,
      pending_day: undefined,
      pending_logged_for: undefined,
    };
    await supabaseAdmin.from("profiles").update({ bot_state: nextState }).eq("id", profile.id);
    profile = { ...profile, bot_state: nextState };
    if (pendingTemp !== null) {
      await reply(profile, from, `✅ Got it — your cycle started *${parsedDate}*. I'll now save the temperature you sent using this corrected cycle day.`);
      const correctedDate = pendingDay ? isoDate(addDays(new Date(parsedDate), pendingDay - 1)) : (pendingDate ?? isoDate(new Date()));
      await handleTempLog(profile, from, pendingTemp, undefined, correctedDate);
      return;
    }
    await reply(
      profile,
      from,
      `✅ Got it — your cycle started *${parsedDate}*. From now on, send your morning basal temperature (e.g. *36.7*) and I'll track your fertile window.\n\n🗓️ Logging a past day? Add a date or cycle day, e.g. *36.7 2026-06-01*, *36.7 01/06*, *36.7 yesterday*, or *36.7 d5*.\n\nType *help* for more commands.`,
    );
    return;
  }

  // Awaiting answer to "are you bleeding today?" (cycle overdue)
  if (botState.awaiting_bleeding_check) {
    const yes = /^\s*(yes|y|yep|yeah|yup|oui|ego|ndabihora|ndabivuga|sí|si)\b/i.test(trimmed);
    const no = /^\s*(no|n|nope|nah|non|oya)\b/i.test(trimmed);
    if (!yes && !no) {
      await reply(profile, from, "🩸 Quick check first — are you bleeding today? Reply *YES* or *NO*.");
      return;
    }
    const pendingTemp = typeof botState.pending_temp === "number" ? botState.pending_temp : null;
    const pendingDate = typeof botState.pending_logged_for === "string" ? botState.pending_logged_for : isoDate(new Date());
    const clearedState = {
      ...botState,
      awaiting_bleeding_check: false,
      pending_temp: undefined,
      pending_logged_for: undefined,
      last_bleeding_check_on: pendingDate,
    };
    await supabaseAdmin.from("profiles").update({ bot_state: clearedState }).eq("id", profile.id);
    profile = { ...profile, bot_state: clearedState };

    if (yes) {
      // Close active cycle, open a new one starting on the pending log date.
      await supabaseAdmin
        .from("cycles")
        .update({ status: "completed", ended_on: pendingDate })
        .eq("user_id", profile.id)
        .eq("status", "active");
      await supabaseAdmin
        .from("cycles")
        .insert({ user_id: profile.id, started_on: pendingDate, status: "active" });
      await reply(profile, from, `🩸 Got it — new cycle starts today (${pendingDate}). That's *day 1*. I'll recalibrate your fertile window from here.`);
      if (pendingTemp !== null) {
        await handleTempLog(profile, from, pendingTemp, undefined, pendingDate);
      }
      return;
    }
    // NO — keep counting beyond the average. Just log the temp at the natural day.
    await reply(profile, from, `👍 Thanks — I'll keep counting past your usual cycle length until bleeding starts.`);
    if (pendingTemp !== null) {
      await handleTempLog(profile, from, pendingTemp, undefined, pendingDate);
    }
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
      profile,
      from,
      `🩸 New cycle started on ${today}. I'll predict your fertile window based on your ${profile.avg_cycle_length}-day average. Send your daily BBT to refine it.`,
    );
    void cycle;
    return;
  }

  if (lower === "status" || lower === "chart") {
    await sendStatus(profile, from);
    return;
  }

  // Try parsing a temperature (with optional day number or date)
  const parsed = parseTempAndDay(trimmed);
  if (parsed) {
    await handleTempLog(profile, from, parsed.temp, parsed.day, parsed.date);
    return;
  }

  // Fallback: friendly hint
  await reply(
    profile,
    from,
    `I didn't catch a temperature in that. Send a number like *36.7* (or *36.7 d5* to log a past day), or *help* for commands.`,
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

  const history = await getCycleHistory(profile.id);
  const stats = predictCycle({
    cycleStart,
    today: new Date(),
    avgCycleLength: profile.avg_cycle_length,
    periodLength: profile.period_length,
    temps,
    cycleHistory: history,
  });

  const ovDate = isoDate(addDays(cycleStart, stats.estimatedOvulationDay - 1));
  const nextPeriodDate = isoDate(addDays(cycleStart, stats.predictedCycleLength));
  const fertileStartDate = isoDate(addDays(cycleStart, stats.fertileStartDay - 1));
  const fertileEndDate = isoDate(addDays(cycleStart, stats.fertileEndDay - 1));

  const ovText = stats.ovulationConfirmed
    ? `🥚 Ovulation: ~day ${stats.estimatedOvulationDay} (${ovDate}) — confirmed by temperature rise.`
    : `🥚 Predicted ovulation: day ${stats.estimatedOvulationDay} (${ovDate}).`;

  const historyNote =
    history.length >= 2
      ? `📚 Based on ${history.length} past cycle${history.length === 1 ? "" : "s"} (avg ${stats.predictedCycleLength}d, ±${stats.cycleLengthStdDev}d)`
      : `📚 Add more cycles to sharpen predictions — currently using your ${profile.avg_cycle_length}-day default.`;

  const caption = [
    `📊 *Status* — cycle started ${cycle.started_on}`,
    stats.message,
    "",
    `🔴 Fertile window: days ${stats.fertileStartDay}–${stats.fertileEndDay} (${fertileStartDate} → ${fertileEndDate})`,
    `🟢 Other days are low-fertility.`,
    stats.fertileWindowClosed
      ? `🟢 No protection needed today — fertile window confirmed closed by 3+ days of elevated temperature.`
      : `🛡️ Use protection today.`,
    ovText,
    `🩸 Next period predicted: ${nextPeriodDate}`,
    `📈 Logs this cycle: ${temps.length}`,
    historyNote,
    "",
    `ℹ️ This bot helps you track fertility patterns. Predictions update with every new temperature you log — expect them to shift as your cycle unfolds.`,
  ].join("\n");


  const chartUrl = buildChartUrl({
    avgCycleLength: stats.predictedCycleLength,
    periodLength: profile.period_length,
    temps,
    stats,
  });
  await replyImage(profile, from, chartUrl, caption);
}

async function handleTempLog(profile: any, from: string, temp: number, day?: number, dateIso?: string) {
  const today = isoDate(new Date());
  const cycle = await getOrCreateActiveCycle(profile.id, today);

  // Compute logged_for date: explicit date wins, otherwise today. If the user
  // supplies a cycle day, align day N to the logged date so all predicted dates
  // match the day they just entered.
  const loggedFor = dateIso ?? today;
  let cycleStartIso = cycle.started_on;
  if (day) {
    const currentCycleDay = daysBetween(new Date(cycle.started_on), new Date(loggedFor)) + 1;
    if (currentCycleDay !== day) {
      const botState = readBotState(profile);
      const nextState = {
        ...botState,
        awaiting_period_start: true,
        pending_temp: temp,
        pending_day: day,
        pending_logged_for: loggedFor,
      };
      await supabaseAdmin.from("profiles").update({ bot_state: nextState }).eq("id", profile.id);
      await reply(
        { ...profile, bot_state: nextState },
        from,
        `✅ I received ${temp.toFixed(2)}°C for cycle day ${day}.

📅 Your saved cycle start makes ${loggedFor} look like day ${currentCycleDay}, so before I update the chart: what date was the *first day of your period* (day 1 of bleeding)?

Reply with a date like *2026-06-01*, *01/06*, *yesterday*, *today*, or *5 days ago*.`,
      );
      return;
    }
    cycleStartIso = isoDate(addDays(new Date(loggedFor), -(day - 1)));
    if (cycleStartIso !== cycle.started_on) {
      await supabaseAdmin.from("cycles").update({ started_on: cycleStartIso }).eq("id", cycle.id);
    }
  }

  // If the user is past their average cycle length and we haven't already
  // asked today, pause and check whether bleeding has started.
  const computedDay = daysBetween(new Date(cycleStartIso), new Date(loggedFor)) + 1;
  const threshold = profile.avg_cycle_length || 28;
  const botStateNow = readBotState(profile);
  if (
    !day &&
    computedDay > threshold &&
    botStateNow.last_bleeding_check_on !== loggedFor &&
    !botStateNow.awaiting_period_start
  ) {
    const nextState = {
      ...botStateNow,
      awaiting_bleeding_check: true,
      pending_temp: temp,
      pending_logged_for: loggedFor,
    };
    await supabaseAdmin.from("profiles").update({ bot_state: nextState }).eq("id", profile.id);
    await reply(
      { ...profile, bot_state: nextState },
      from,
      `📅 You're on day ${computedDay} — past your usual ${threshold}-day cycle. *Are you bleeding today?* Reply *YES* (I'll start a new cycle as day 1) or *NO* (I'll keep counting).`,
    );
    return;
  }

  const cycleStart = new Date(cycleStartIso);

  // Upsert log for that date
  const { error: upErr } = await supabaseAdmin
    .from("temperature_logs")
    .upsert(
      {
        user_id: profile.id,
        cycle_id: cycle.id,
        logged_for: loggedFor,
        temp_celsius: temp,
        source: "whatsapp",
      },
      { onConflict: "user_id,logged_for" },
    );
  if (upErr) {
    console.error("upsert temp error", upErr);
    await reply(profile, from, "Sorry, I couldn't save that. Please try again.");
    return;
  }

  // Build prediction with all logs in this cycle
  const { data: logs } = await supabaseAdmin
    .from("temperature_logs")
    .select("logged_for, temp_celsius")
    .eq("cycle_id", cycle.id)
    .order("logged_for");

  const temps: TempPoint[] =
    (logs ?? []).map((l) => ({
      day: Math.floor(
        (new Date(l.logged_for).getTime() - cycleStart.getTime()) / 86400000,
      ) + 1,
      temp: Number(l.temp_celsius),
      date: l.logged_for,
    }));

  const history = await getCycleHistory(profile.id);
  // Contextualize the prediction to the *logged* date so the status message
  // reflects the day the user is actually reporting, not today's calendar day.
  const stats = predictCycle({
    cycleStart,
    today: new Date(loggedFor),
    avgCycleLength: profile.avg_cycle_length,
    periodLength: profile.period_length,
    temps,
    cycleHistory: history,
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

  const ovDate = isoDate(addDays(cycleStart, stats.estimatedOvulationDay - 1));
  const nextPeriodDate = isoDate(addDays(cycleStart, stats.predictedCycleLength));
  const loggedDayNum = day ?? stats.cycleDay;

  const fertileNote =
    stats.confidence === "low"
      ? "🔴 Potentially fertile (wide estimate — log a full cycle or two to narrow it down)"
      : stats.confidence === "medium"
        ? "🔴 Likely fertile window"
        : "🔴 Fertile window";
  const greenNote =
    stats.confidence === "high"
      ? "🟢 Confirmed low-fertility days: after the temperature rise until next period"
      : stats.confidence === "medium"
        ? "🟢 Other days are likely low-fertility based on your cycle history"
        : "🟢 Only days we're confident are low-fertility will be marked green — keep logging daily to unlock this";

  const caption = [
    `✅ Logged ${temp.toFixed(2)}°C for cycle day ${loggedDayNum} (${loggedFor}).`,
    "",
    stats.message,
    "",
    `${fertileNote}: days ${stats.fertileStartDay}–${stats.fertileEndDay}`,
    greenNote,
    stats.fertileWindowClosed
      ? `🟢 No protection needed today — fertile window confirmed closed by 3+ days of elevated temperature.`
      : `🛡️ Use protection today.`,
    stats.ovulationConfirmed
      ? `🥚 Ovulation confirmed around day ${stats.estimatedOvulationDay} (${ovDate})`
      : `🥚 Predicted ovulation: day ${stats.estimatedOvulationDay} (${ovDate}) — estimate`,
    `🩸 Next period predicted: ${nextPeriodDate}`,
    "",
    `ℹ️ This bot helps you track fertility patterns. Predictions can shift with each new temperature — the more days you log, the more accurate they get.`,
    aiText ? "" : "",
    aiText,
  ].filter((l) => l !== null).join("\n");

  const chartUrl = buildChartUrl({
    avgCycleLength: stats.predictedCycleLength,
    periodLength: profile.period_length,
    temps,
    stats,
  });
  await replyImage(profile, from, chartUrl, caption);
}

export async function sendDailyLogReminders(now = new Date()) {
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .not("whatsapp_number", "is", null);
  if (error) throw error;

  for (const profile of profiles ?? []) {
    if (!profile.whatsapp_number) continue;
    const state = readBotState(profile);
    const timeZone = typeof state.timezone === "string" ? state.timezone : phoneTimezone(profile.whatsapp_number);
    const local = localDateHour(now, timeZone);
    if (local.hour !== 6 || state.last_6am_reminder_on === local.date) continue;

    // If user is past their average cycle length, ask the bleeding question
    // instead of the usual log reminder.
    let message = "⏰ Good morning — please log your BBT now, before getting out of bed. Send your temperature like *36.72*.";
    const { data: cycle } = await supabaseAdmin
      .from("cycles")
      .select("started_on")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .order("started_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cycle) {
      const computedDay = daysBetween(new Date(cycle.started_on), new Date(`${local.date}T00:00:00`)) + 1;
      const threshold = profile.avg_cycle_length || 28;
      if (computedDay > threshold && state.last_bleeding_check_on !== local.date) {
        message = `⏰ Good morning — you're on day ${computedDay}, past your usual ${threshold}-day cycle. *Are you bleeding today?* Reply *YES* (new cycle starts as day 1) or *NO* (I'll keep counting). Then send your BBT.`;
        await supabaseAdmin
          .from("profiles")
          .update({ bot_state: { ...state, timezone: timeZone, awaiting_bleeding_check: true, pending_logged_for: local.date, last_6am_reminder_on: local.date } })
          .eq("id", profile.id);
        await reply(profile, `+${profile.whatsapp_number}`, message);
        continue;
      }
    }

    await reply(profile, `+${profile.whatsapp_number}`, message);
    await supabaseAdmin
      .from("profiles")
      .update({ bot_state: { ...state, timezone: timeZone, last_6am_reminder_on: local.date } })
      .eq("id", profile.id);
  }
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
