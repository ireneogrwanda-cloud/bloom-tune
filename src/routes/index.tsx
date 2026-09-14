import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getChatHistory, sendChatMessage, type ChatMessage } from "@/lib/chat.functions";
import { getDashboard } from "@/lib/profile.functions";
import { CycleChart } from "@/components/cycle-chart";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import {
  Send,
  Phone,
  Video,
  MoreVertical,
  Smile,
  Paperclip,
  ShieldCheck,
  Check,
  CheckCheck,
  Clock,
  Download,
  Share,
  ArrowDown,
  LineChart as LineChartIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "My Cycle AI — chat your daily temperature, know your fertile days" },
      {
        name: "description",
        content:
          "Chat with My Cycle AI just like WhatsApp: send your morning basal body temperature and get instant fertile-window predictions and cycle charts.",
      },
      { property: "og:title", content: "My Cycle AI — chat your daily temperature, know your fertile days" },
      {
        property: "og:description",
        content: "A WhatsApp-style chat that turns your daily BBT into clear fertile and infertile days.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatHome,
});

function ChatHome() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-emerald-50 via-background to-background">
      <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col">
        <ChatHeader authed={authed} />
        <InstallBanner />
        {authed === null ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : authed ? (
          <ChatThread />
        ) : (
          <SignedOutPane />
        )}
      </div>
    </div>
  );
}

function InstallBanner() {
  const { canInstall, showIosHint, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || (!canInstall && !showIosHint)) return null;

  return (
    <div className="flex items-center gap-3 border-b bg-emerald-50 px-4 py-2 text-emerald-900">
      <img src="/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" loading="lazy" />
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-medium">Add My Cycle AI to your home screen</p>
        {showIosHint ? (
          <p className="flex items-center gap-1 text-[11px] text-emerald-800/80">
            Tap <Share className="h-3 w-3" /> then “Add to Home Screen”
          </p>
        ) : (
          <p className="text-[11px] text-emerald-800/80">Opens full screen, just like an app.</p>
        )}
      </div>
      {canInstall ? (
        <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={() => void install()}>
          <Download className="mr-1 h-4 w-4" /> Install
        </Button>
      ) : null}
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss install banner"
        className="text-lg leading-none text-emerald-800/60"
      >
        ×
      </button>
    </div>
  );
}

function ChatHeader({ authed }: { authed: boolean | null }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 bg-emerald-700 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-emerald-50 shadow-md">
      <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-emerald-50">
        <img src="/icon-192.png" alt="My Cycle AI" width={40} height={40} className="h-10 w-10" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold leading-tight">My Cycle AI</p>
        <p className="truncate text-xs text-emerald-100/90">fertility assistant · online</p>
      </div>
      <div className="flex items-center gap-1 opacity-90">
        <Video className="h-5 w-5" />
        <Phone className="h-5 w-5" />
        <MoreVertical className="h-5 w-5" />
      </div>
      {authed ? (
        <Button asChild size="sm" variant="secondary" className="ml-2">
          <Link to="/dashboard">Dashboard</Link>
        </Button>
      ) : null}
    </header>
  );
}

const WALLPAPER =
  "radial-gradient(circle at 20% 15%, rgba(16,185,129,0.10) 0 2px, transparent 3px), radial-gradient(circle at 70% 60%, rgba(16,185,129,0.08) 0 2px, transparent 3px)";

const WALLPAPER_STYLE = {
  backgroundImage: WALLPAPER,
  backgroundSize: "120px 120px",
  backgroundColor: "hsl(60 20% 96%)",
} as const;

const QUICK_REPLIES = ["status", "chart", "history", "period", "help"];

function SignedOutPane() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 px-4 py-6" style={WALLPAPER_STYLE}>
      <Bubble side="left">
        👋 Hi! I'm <strong>My Cycle AI</strong>. Send me your morning basal body temperature — like <em>36.52</em> — and I'll
        tell you your cycle day, your fertile window, and chart it for you.
      </Bubble>
      <Bubble side="right">36.52</Bubble>
      <Bubble side="left">
        ✅ Logged 36.52°C for cycle day 12.
        <br />
        <br />
        🔴 Fertile window: days 9–15
        <br />
        🥚 Predicted ovulation: day 14
      </Bubble>
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <p className="text-sm font-medium">Sign in to start chatting with My Cycle AI</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Your chat works the same here and on WhatsApp — same history, same predictions.
        </p>
        <div className="mt-3 flex gap-2">
          <Button asChild size="sm">
            <Link to="/signup">Create free account</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This bot helps you track fertility patterns.
        </p>
      </div>
    </div>
  );
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function ChatThread() {
  const qc = useQueryClient();
  const fetchHistory = useServerFn(getChatHistory);
  const send = useServerFn(sendChatMessage);
  const fetchDash = useServerFn(getDashboard);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [chartOpen, setChartOpen] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat-history"],
    queryFn: () => fetchHistory({}),
  });

  const { data: dash } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDash(),
  });

  const mutation = useMutation({
    mutationFn: (text: string) => send({ data: { text } }),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["chat-history"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      setPending(null);
    },
  });

  useEffect(() => {
    if (atBottom) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, mutation.isPending, pending, atBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  function submitText(text: string) {
    const value = text.trim();
    if (!value || mutation.isPending) return;
    setDraft("");
    setPending(value);
    setAtBottom(true);
    mutation.mutate(value);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    submitText(draft);
  }

  let lastDay = "";

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative flex-1 space-y-2 overflow-y-auto px-3 py-4"
        style={WALLPAPER_STYLE}
      >
        {isLoading ? (
          <p className="py-10 text-center text-xs text-muted-foreground">Loading your conversation…</p>
        ) : messages.length === 0 ? (
          <Bubble side="left">
            👋 Welcome! Send your morning temperature (e.g. <em>36.52</em>) or type <strong>help</strong> to see
            everything I can do.
          </Bubble>
        ) : (
          messages.map((m: ChatMessage) => {
            const label = dayLabel(m.createdAt);
            const showDay = label !== lastDay;
            lastDay = label;
            return (
              <div key={m.id} className="space-y-2">
                {showDay ? <DaySeparator label={label} /> : null}
                <Bubble side={m.direction === "in" ? "right" : "left"} time={m.createdAt} status="read">
                  {m.imageUrl ? (
                    <img src={m.imageUrl} alt="Cycle chart" loading="lazy" className="mb-2 rounded-lg" />
                  ) : null}
                  <Formatted text={m.body ?? ""} />
                </Bubble>
              </div>
            );
          })
        )}
        {pending ? (
          <Bubble side="right" status="pending">
            {pending}
          </Bubble>
        ) : null}
        {mutation.isPending ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-card px-3 py-3 shadow-sm">
              <Dot delay="0ms" />
              <Dot delay="150ms" />
              <Dot delay="300ms" />
            </div>
          </div>
        ) : null}
        {mutation.isError ? (
          <Bubble side="left">
            <span className="text-destructive">Something went wrong sending that. Please try again.</span>
          </Bubble>
        ) : null}
        <div ref={endRef} />
      </div>

      {!atBottom ? (
        <button
          onClick={() => {
            setAtBottom(true);
            endRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
          aria-label="Scroll to latest message"
          className="fixed bottom-28 right-4 z-10 rounded-full bg-card p-2 shadow-md"
        >
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
        </button>
      ) : null}

      <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur">
        <div className="flex gap-2 overflow-x-auto px-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => submitText(q)}
              disabled={mutation.isPending}
              className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium capitalize text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={submit}
          className="flex items-end gap-2 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
        >
          <div className="flex flex-1 items-center gap-2 rounded-full border bg-card px-3 py-2">
            <Smile className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              placeholder="Type a message, e.g. 36.52"
              aria-label="Message My Cycle AI"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <Paperclip className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full bg-emerald-600 hover:bg-emerald-700"
            disabled={!draft.trim() || mutation.isPending}
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50"
      style={{ animationDelay: delay }}
    />
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-1">
      <span className="rounded-full bg-card/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
        {label}
      </span>
    </div>
  );
}

// Render WhatsApp *bold* markers and line breaks.
function Formatted({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <strong key={i}>{p.slice(1, -1)}</strong> : <span key={i}>{p}</span>,
      )}
    </span>
  );
}

function Bubble({
  side,
  children,
  time,
  status,
}: {
  side: "left" | "right";
  children: React.ReactNode;
  time?: string;
  status?: "pending" | "sent" | "read";
}) {
  const right = side === "right";
  return (
    <div className={right ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          right ? "rounded-br-sm bg-emerald-600 text-emerald-50" : "rounded-bl-sm bg-card text-card-foreground"
        }`}
      >
        {children}
        {time || (right && status) ? (
          <div
            className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
              right ? "text-emerald-100/80" : "text-muted-foreground"
            }`}
          >
            <span>
              {time ? new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now"}
            </span>
            {right && status === "pending" ? <Clock className="h-3 w-3" /> : null}
            {right && status === "sent" ? <Check className="h-3 w-3" /> : null}
            {right && status === "read" ? <CheckCheck className="h-3 w-3" /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
