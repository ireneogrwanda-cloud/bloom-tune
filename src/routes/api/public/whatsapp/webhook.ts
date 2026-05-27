import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { verifyTwilioSignature } from "@/lib/whatsapp.server";
import { handleIncomingMessage } from "@/lib/bot.server";

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      // Twilio doesn't use GET verification, but respond OK for health checks.
      GET: async () => new Response("ok", { status: 200 }),

      POST: async ({ request }: { request: Request }) => {
        const rawBody = await request.text();
        const params: Record<string, string> = {};
        for (const [k, v] of new URLSearchParams(rawBody)) params[k] = v;

        // Twilio signs against the exact public URL Twilio is configured to call.
        // Prefer X-Forwarded-* headers if present, then fall back to request.url.
        const proto =
          request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
        const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
        const path = new URL(request.url).pathname;
        const fullUrl = host ? `${proto}://${host}${path}` : request.url;

        const sigHeader = request.headers.get("x-twilio-signature");
        const valid = await verifyTwilioSignature(fullUrl, params, sigHeader);
        if (!valid) {
          console.warn("Twilio webhook: invalid signature", { fullUrl });
          return new Response("Invalid signature", { status: 401 });
        }

        try {
          const from = params.From ?? ""; // e.g. "whatsapp:+15551234567"
          const waId = params.MessageSid ?? "";
          const text = params.Body ?? "";
          const numMedia = Number(params.NumMedia ?? "0");

          if (from && (text || numMedia > 0)) {
            const phone = from.replace(/^whatsapp:/, "");
            await handleIncomingMessage({
              from: phone,
              waMessageId: waId,
              text,
              raw: params,
            });
          }
        } catch (e) {
          console.error("twilio webhook processing error", e);
        }

        // Empty TwiML — we reply via the REST API in handleIncomingMessage.
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        });
      },
    },
  },
});
