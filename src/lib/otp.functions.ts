import { z } from "zod";

export const phoneSchema = z
  .string()
  .min(7)
  .max(20)
  .regex(/^\+?\d[\d\s\-()]*$/, "Use digits and optional +, spaces, dashes");

/** Auth uses Supabase's verified WhatsApp OTP directly from the browser. */
export function normalizeWhatsAppPhone(phone: string): string {
  const parsed = phoneSchema.parse(phone);
  const normalized = parsed.replace(/[^\d]/g, "");
  if (normalized.length < 7) throw new Error("Enter a valid WhatsApp number with country code.");
  return `+${normalized}`;
}
