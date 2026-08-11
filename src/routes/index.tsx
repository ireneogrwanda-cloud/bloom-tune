import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getChatHistory, sendChatMessage, type ChatMessage } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { Send, Phone, Video, MoreVertical, Smile, Paperclip, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mira — chat your daily temperature, know your fertile days" },
      {
        name: "description",
        content:
          "Chat with Mira just like WhatsApp: send your morning basal body temperature and get instant fertile-window predictions and cycle charts.",
      },
      { property: "og:title", content: "Mira — chat your daily temperature, know your fertile days" },
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
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-background to-background">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
        <ChatHeader authed={authed} />
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

function ChatHeader({ authed }: { authed: boolean | null }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 bg-emerald-700 px-4 py-3 text-emerald-50 shadow-md">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-base font-bold text-emerald-800">
        M
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold leading-tight">Mira</p>
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

function SignedOutPane() {
  return (
    <div
      className="flex flex-1 flex-col justify-end gap-3 px-4 py-6"
      style={{ backgroundImage: WALLPAPER, backgroundSize: "120px 120px", backgroundColor: "hsl(60 20% 96%)" }}
    >
      <Bubble side="left">
        👋 Hi! I'm <strong>Mira</strong>. Send me your morning basal body temperature — like <em>36.52</em> — and I'll
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
        <p className="text-sm font-medium">Sign in to start chatting with Mira</p>
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

function ChatThread() {
  const qc = useQueryClient();
  const fetchHistory = useServerFn(getChatHistory);
  const send = useServerFn(sendChatMessage);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat-history"],
    queryFn: () => fetchHistory({}),
  });

  const mutation = useMutation({
    mutationFn: (text: string) => send({ data: { text } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-history"] }),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, mutation.isPending]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || mutation.isPending) return;
    setDraft("");
    mutation.mutate(text);
  }

  return (
    <>
      <div
        className="flex-1 space-y-2 overflow-y-auto px-3 py-4"
        style={{ backgroundImage: WALLPAPER, backgroundSize: "120px 120px", backgroundColor: "hsl(60 20% 96%)" }}
      >
        {isLoading ? (
          <p className="py-10 text-center text-xs text-muted-foreground">Loading your conversation…</p>
        ) : messages.length === 0 ? (
          <Bubble side="left">
            👋 Welcome! Send your morning temperature (e.g. <em>36.52</em>) or type <strong>help</strong> to see
            everything I can do.
          </Bubble>
        ) : (
          messages.map((m: ChatMessage) => (
            <Bubble key={m.id} side={m.direction === "in" ? "right" : "left"} time={m.createdAt}>
              {m.imageUrl ? (
                <img src={m.imageUrl} alt="Cycle chart" loading="lazy" className="mb-2 rounded-lg" />
              ) : null}
              <Formatted text={m.body ?? ""} />
            </Bubble>
          ))
        )}
        {mutation.isPending ? (
          <Bubble side="left">
            <span className="animate-pulse text-muted-foreground">Mira is typing…</span>
          </Bubble>
        ) : null}
        {mutation.isError ? (
          <Bubble side="left">
            <span className="text-destructive">Something went wrong sending that. Please try again.</span>
          </Bubble>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="sticky bottom-0 flex items-end gap-2 border-t bg-background/95 px-3 py-2 backdrop-blur"
      >
        <div className="flex flex-1 items-center gap-2 rounded-full border bg-card px-3 py-2">
          <Smile className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            placeholder="Type a message, e.g. 36.52"
            aria-label="Message Mira"
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
    </>
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
}: {
  side: "left" | "right";
  children: React.ReactNode;
  time?: string;
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
        {time ? (
          <div className={`mt-1 text-right text-[10px] ${right ? "text-emerald-100/80" : "text-muted-foreground"}`}>
            {new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
