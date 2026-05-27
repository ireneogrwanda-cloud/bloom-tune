// Twilio WhatsApp helpers — server only. All outbound requests go through the
// Lovable connector gateway, so we never read Twilio account credentials here.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

function gatewayHeaders() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
  if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY is not configured");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": TWILIO_API_KEY,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

function getFrom(): string {
  // Default to the Twilio WhatsApp Sandbox sender if not configured.
  const from = process.env.TWILIO_WHATSAPP_FROM || "+14155238886";
  return from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
}

function toWa(to: string): string {
  return to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
}

export async function sendWhatsAppText(to: string, body: string) {
  const params = new URLSearchParams({
    To: toWa(to),
    From: getFrom(),
    Body: body.slice(0, 1500),
  });
  const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: params,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Twilio WhatsApp send failed", res.status, data);
    throw new Error(`Twilio send failed [${res.status}]: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function sendWhatsAppImage(to: string, imageUrl: string, caption?: string) {
  const params = new URLSearchParams({
    To: toWa(to),
    From: getFrom(),
    MediaUrl: imageUrl,
  });
  if (caption) params.set("Body", caption.slice(0, 1500));
  const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: params,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Twilio WhatsApp image send failed", res.status, data);
  }
  return data;
}

// Verify Twilio's X-Twilio-Signature on inbound webhooks.
// Algorithm: HMAC-SHA1( fullUrl + concat(sortedParamKey + paramValue) ), base64.
// Reference: https://www.twilio.com/docs/usage/webhooks/webhooks-security
export async function verifyTwilioSignature(
  fullUrl: string,
  params: Record<string, string>,
  header: string | null,
): Promise<boolean> {
  if (!header) return false;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn("TWILIO_AUTH_TOKEN missing — cannot verify signature");
    return false;
  }
  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const k of sortedKeys) data += k + params[k];

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  }
  return diff === 0;
}
