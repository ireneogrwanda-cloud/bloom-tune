import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const phoneSchema = z
  .string()
  .min(7)
  .max(20)
  .regex(/^\+?\d[\d\s\-()]*$/, "Use digits and optional +, spaces, dashes");

function normalize(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

async function sha256(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const requestWhatsAppCode = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string }) => z.object({ phone: phoneSchema }).parse(input))
  .handler(async ({ data }) => {
    const n = normalize(data.phone);
    if (n.length < 7) throw new Error("Enter a valid WhatsApp number with country code.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWhatsAppText } = await import("@/lib/whatsapp.server");

    // Simple resend cooldown (60s)
    const { data: recent } = await supabaseAdmin
      .from("wa_otp_codes")
      .select("created_at")
      .eq("phone", n)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent?.created_at && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
      throw new Error("We just sent you a code. Please wait a minute before asking for another.");
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await sha256(`${n}:${code}`);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    const { error } = await supabaseAdmin
      .from("wa_otp_codes")
      .insert({ phone: n, code_hash: codeHash, expires_at: expiresAt });
    if (error) throw error;

    const sent = (await sendWhatsAppText(
      `+${n}`,
      `🔐 Your My Cycle AI login code is ${code}\n\nIt expires in 10 minutes. Never share this code with anyone.`,
    )) as { sid?: string };

    // Twilio accepts the message first and fails asynchronously, so confirm delivery
    // started before telling the user to watch their phone.
    if (sent?.sid) {
      const { getMessageStatus } = await import("@/lib/whatsapp.server");
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        const st = await getMessageStatus(sent.sid);
        if (!st) break;
        if (st.status === "failed" || st.status === "undelivered") {
          await supabaseAdmin.from("wa_otp_codes").delete().eq("phone", n).is("consumed_at", null);
          if (st.errorCode === 63015 || st.errorCode === 63016 || st.errorCode === 21211) {
            throw new Error(
              "WhatsApp would not deliver the code to this number yet. Open WhatsApp, send the join message to +1 415 523 8886 to connect with My Cycle AI, then try again.",
            );
          }
          throw new Error("WhatsApp could not deliver the code to this number. Please check it and try again.");
        }
        if (st.status === "sent" || st.status === "delivered" || st.status === "read") break;
      }
    }

    return { ok: true, phone: n };
  });

export const verifyWhatsAppCode = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; code: string }) =>
    z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") }).parse(input),
  )
  .handler(async ({ data }) => {
    const n = normalize(data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("wa_otp_codes")
      .select("*")
      .eq("phone", n)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) throw new Error("No active code. Please request a new one.");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("That code has expired. Request a new one.");
    if (row.attempts >= 5) throw new Error("Too many attempts. Please request a new code.");

    const codeHash = await sha256(`${n}:${data.code}`);
    if (codeHash !== row.code_hash) {
      await supabaseAdmin
        .from("wa_otp_codes")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      throw new Error("That code is not correct.");
    }

    await supabaseAdmin.from("wa_otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

    // Find or create the account tied to this WhatsApp number.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("whatsapp_number", n)
      .maybeSingle();

    let userId = profile?.id as string | undefined;
    const email = `wa_${n}@bot.local`;
    let isNew = false;

    if (!userId) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { display_name: `WhatsApp ${n.slice(-4)}`, whatsapp_number: n },
      });
      if (createErr || !created?.user) throw new Error("Could not create your account. Please try again.");
      userId = created.user.id;
      isNew = true;
      const { error: profErr } = await supabaseAdmin
        .from("profiles")
        .update({ whatsapp_number: n })
        .eq("id", userId);
      if (profErr) throw profErr;
    }

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(userId!);
    const loginEmail = userRes?.user?.email ?? email;

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: loginEmail,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      throw new Error("Could not start your session. Please try again.");
    }

    return { tokenHash: link.properties.hashed_token, isNew };
  });
