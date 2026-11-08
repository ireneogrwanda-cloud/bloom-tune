import { describe, expect, it } from "vitest";
import { normalizeWhatsAppPhone } from "./otp.functions";

describe("WhatsApp phone normalization", () => {
  it("creates the E.164 format required by verified phone auth", () => {
    expect(normalizeWhatsAppPhone("+250 786-105-992")).toBe("+250786105992");
  });

  it("rejects values that are not phone numbers", () => {
    expect(() => normalizeWhatsAppPhone("not-a-number")).toThrow();
    expect(() => normalizeWhatsAppPhone("+123")).toThrow();
  });
});
