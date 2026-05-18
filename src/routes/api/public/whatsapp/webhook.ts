import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { verifyMetaSignature } from "@/lib/whatsapp.server";
import { handleIncomingMessage } from "@/lib/bot.server";

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      // Meta sends a GET request to verify the webhook.
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.WHATSAPP_VERIFY_TOKEN;
        if (mode === "subscribe" && expected && token === expected && challenge) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }: { request: Request }) => {
        const rawBody = await request.text();
        const sigHeader = request.headers.get("x-hub-signature-256");
        const valid = await verifyMetaSignature(rawBody, sigHeader);
        if (!valid) {
          console.warn("WhatsApp webhook: invalid signature");
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        // Process messages asynchronously so we respond fast (Meta retries on slow replies)
        try {
          const entries = payload?.entry ?? [];
          for (const entry of entries) {
            const changes = entry?.changes ?? [];
            for (const change of changes) {
              const value = change?.value;
              const messages = value?.messages ?? [];
              for (const msg of messages) {
                if (msg.type !== "text") continue;
                const from: string = msg.from;
                const waId: string = msg.id;
                const text: string = msg.text?.body ?? "";
                try {
                  await handleIncomingMessage({ from, waMessageId: waId, text, raw: msg });
                } catch (e) {
                  console.error("handleIncomingMessage error", e);
                }
              }
            }
          }
        } catch (e) {
          console.error("webhook processing error", e);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
