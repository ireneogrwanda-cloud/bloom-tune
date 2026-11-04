import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profileRes, cyclesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("cycles")
        .select("*")
        .eq("user_id", userId)
        .order("started_on", { ascending: false }),
    ]);
    if (profileRes.error) throw profileRes.error;
    if (cyclesRes.error) throw cyclesRes.error;

    const activeCycle = cyclesRes.data?.find((c) => c.status === "active") ?? null;
    let logs: any[] = [];
    if (activeCycle) {
      const { data } = await supabase
        .from("temperature_logs")
        .select("*")
        .eq("user_id", userId)
        .or(`cycle_id.eq.${activeCycle.id},logged_for.gte.${activeCycle.started_on}`)
        .order("logged_for");
      logs = data ?? [];
    }
    const { data: allLogs } = await supabase
      .from("temperature_logs")
      .select("logged_for, temp_celsius, excluded, exclude_reason, cycle_id")
      .eq("user_id", userId)
      .order("logged_for");
    return {
      profile: profileRes.data,
      cycles: cyclesRes.data ?? [],
      activeCycle,
      activeLogs: logs,
      allLogs: allLogs ?? [],
    };
  });

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

const phoneSchema = z
  .string()
  .min(7)
  .max(20)
  .regex(/^\+?\d[\d\s\-()]*$/, "Use digits and optional +, spaces, dashes");

const onboardSchema = z.object({
  displayName: z.string().min(1).max(80),
  whatsappNumber: phoneSchema,
  avgCycleLength: z.number().int().min(20).max(45),
  periodLength: z.number().int().min(2).max(10),
  lastPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  disclaimerAccepted: z.literal(true),
});

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => onboardSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const normalized = data.whatsappNumber.replace(/[^\d]/g, "");

    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        display_name: data.displayName,
        whatsapp_number: normalized,
        avg_cycle_length: data.avgCycleLength,
        period_length: data.periodLength,
        disclaimer_accepted_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (profErr) {
      if (profErr.code === "23505") throw new Error("That WhatsApp number is already linked to another account.");
      throw profErr;
    }

    // Close any active cycle, start a fresh one
    await supabase
      .from("cycles")
      .update({ status: "completed", ended_on: data.lastPeriodStart })
      .eq("user_id", userId)
      .eq("status", "active");

    const { error: cycErr } = await supabase
      .from("cycles")
      .insert({ user_id: userId, started_on: data.lastPeriodStart, status: "active" });
    if (cycErr) throw cycErr;
    return { ok: true };
  });

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(80),
  whatsappNumber: phoneSchema,
  avgCycleLength: z.number().int().min(20).max(45),
  periodLength: z.number().int().min(2).max(10),
});

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const normalized = data.whatsappNumber.replace(/[^\d]/g, "");
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: data.displayName,
        whatsapp_number: normalized,
        avg_cycle_length: data.avgCycleLength,
        period_length: data.periodLength,
      })
      .eq("id", userId);
    if (error) {
      if (error.code === "23505") throw new Error("That WhatsApp number is already linked to another account.");
      throw error;
    }
    return { ok: true, whatsappNumber: normalized };
  });

const tempSchema = z.object({
  loggedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tempCelsius: z.number().min(35).max(40),
});

export const logTemperature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => tempSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cycle } = await supabase
      .from("cycles")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("started_on", { ascending: false })
      .maybeSingle();
    const { error } = await supabase.from("temperature_logs").upsert(
      {
        user_id: userId,
        cycle_id: cycle?.id ?? null,
        logged_for: data.loggedFor,
        temp_celsius: data.tempCelsius,
        source: "web",
      },
      { onConflict: "user_id,logged_for" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const startNewCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { startedOn: string }) =>
    z.object({ startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("cycles")
      .update({ status: "completed", ended_on: data.startedOn })
      .eq("user_id", userId)
      .eq("status", "active");
    const { error } = await supabase
      .from("cycles")
      .insert({ user_id: userId, started_on: data.startedOn, status: "active" });
    if (error) throw error;
    return { ok: true };
  });
