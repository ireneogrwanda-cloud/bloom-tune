import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellRing, Check } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { listNotifications, markNotificationsRead, registerPushToken } from "@/lib/notifications.functions";
import { enablePush, pushConfigured } from "@/lib/push";
import { useOffline } from "@/lib/offline";

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function NotificationBell({ tone = "light" }: { tone?: "light" | "dark" }) {
  const qc = useQueryClient();
  const { owner, online } = useOffline();
  const navigate = useNavigate();
  const fetchList = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationsRead);
  const saveToken = useServerFn(registerPushToken);
  const [open, setOpen] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", owner],
    queryFn: () => fetchList({ data: { todayIso: localToday() } }),
    enabled: online && !!owner,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const unread = items.filter((n) => !n.read_at);

  const mark = useMutation({
    mutationFn: () => markRead({ data: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Re-register the device token on load so pushes keep working after reinstalls.
  useEffect(() => {
    if (!online || !pushConfigured() || typeof window === "undefined") return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    void enablePush().then((r) => {
      if (r.status === "registered") void saveToken({ data: { token: r.token } });
    });
  }, [saveToken, online]);

  async function turnOnPush() {
    const r = await enablePush();
    if (r.status === "registered") {
      await saveToken({ data: { token: r.token } });
      toast.success("Phone alerts are on");
      return;
    }
    if (r.status === "not-configured") toast.error("Phone alerts aren't set up yet — in-app alerts still work.");
    else if (r.status === "open-in-new-tab") toast.error("Open the app in its own tab or install it, then turn alerts on.");
    else if (r.status === "denied") toast.error("Notifications are blocked. Allow them in your browser settings.");
    else toast.error("This device can't show pop-up notifications.");
  }

  const canAskPush =
    pushConfigured() && typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted";

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (online && v && unread.length) mark.mutate();
      }}
    >
      <PopoverTrigger asChild>
        <button
          aria-label={`Notifications${unread.length ? ` (${unread.length} unread)` : ""}`}
          className={`relative rounded-full p-2 transition ${tone === "dark" ? "hover:bg-emerald-600/50" : "hover:bg-muted"}`}
        >
          {unread.length ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          {unread.length ? (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {items.length ? (
            <button disabled={!online} className="text-xs text-muted-foreground hover:underline" onClick={() => mark.mutate()}>
              <Check className="mr-1 inline h-3 w-3" />
              Mark all read
            </button>
          ) : null}
        </div>

        {canAskPush && online ? (
          <div className="border-b bg-emerald-50 px-4 py-3 text-emerald-900">
            <p className="text-xs font-medium">Get these on your phone</p>
            <p className="mt-0.5 text-[11px] text-emerald-800/80">Morning reminders and fertile-window alerts, even when the app is closed.</p>
            <Button size="sm" className="mt-2 h-7 bg-emerald-600 text-xs hover:bg-emerald-700" onClick={() => void turnOnPush()}>
              Turn on alerts
            </Button>
          </div>
        ) : null}

        <ul className="max-h-80 divide-y overflow-y-auto">
          {items.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing yet — your alerts will appear here.</li>
          ) : (
            items.map((n) => (
              <li key={n.id} className={n.read_at ? "" : "bg-accent/30"}>
                <button
                  className="w-full px-4 py-3 text-left transition hover:bg-muted"
                  onClick={() => {
                    setOpen(false);
                    void navigate({ to: "/assistant" });
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-tight">{n.title}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{n.body}</p>
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
