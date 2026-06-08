import { createFileRoute } from "@tanstack/react-router";
import { sendDailyLogReminders } from "@/lib/bot.server";

export const Route = createFileRoute("/api/public/hooks/log-reminders")({
  server: {
    handlers: {
      POST: async () => {
        try {
          await sendDailyLogReminders();
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          console.error("log-reminders failed", e);
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
