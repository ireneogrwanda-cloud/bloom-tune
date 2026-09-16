import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getChatHistory, sendChatMessage, type ChatMessage } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { Send, Smile, Paperclip, Check, CheckCheck, Clock, ArrowDown } from "lucide-react";

const WALLPAPER_STYLE = {
  backgroundImage:
    "radial-gradient(circle at 20% 15%, rgba(123,63,0,0.08) 0 2px, transparent 3px), radial-gradient(circle at 70% 60%, rgba(233,30,99,0.07) 0 2px, transparent 3px)",
  backgroundSize: "120px 120px",
  backgroundColor: "oklch(0.975 0.014 20)",
} as const;

const QUICK_REPLIES = ["status", "chart", "history", "period", "help"];

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function ChatPanel() {
  const qc = useQueryClient();
  const fetchHistory = useServerFn(getChatHistory);
  const send = useServerFn(sendChatMessage);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat-history"],
    queryFn: () => fetchHistory({}),
  });

  const mutation = useMutation({
    mutationFn: (text: string) => send({ data: { text } }),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["chat-history"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      setPending(null);
      inputRef.current?.focus();
    },
  });

  useEffect(() => {
    if (atBottom) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, mutation.isPending, pending, atBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  let lastDay = "";

  return (
    <div className="flex h-full min-h-0 flex-col">
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
            👋 Ask me anything about your cycle, your fertile days or how this app works — or send your morning
            temperature (e.g. <em>36.52</em>).
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
          className="absolute bottom-28 right-4 z-10 rounded-full bg-card p-2 shadow-md"
        >
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
        </button>
      ) : null}

      <div className="border-t bg-background/95 backdrop-blur">
        <div className="flex gap-2 overflow-x-auto px-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => submitText(q)}
              disabled={mutation.isPending}
              className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium capitalize text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitText(draft);
          }}
          className="flex items-end gap-2 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
        >
          <div className="flex flex-1 items-center gap-2 rounded-full border bg-card px-3 py-2">
            <Smile className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              placeholder="Ask a question, or send 36.52"
              aria-label="Message My Cycle AI"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <Paperclip className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full"
            disabled={!draft.trim() || mutation.isPending}
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: delay }} />
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

export function Formatted({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <strong key={i}>{p.slice(1, -1)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

export function Bubble({
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
          right ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card text-card-foreground"
        }`}
      >
        {children}
        {time || (right && status) ? (
          <div
            className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
              right ? "text-primary-foreground/80" : "text-muted-foreground"
            }`}
          >
            <span>{time ? new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now"}</span>
            {right && status === "pending" ? <Clock className="h-3 w-3" /> : null}
            {right && status === "sent" ? <Check className="h-3 w-3" /> : null}
            {right && status === "read" ? <CheckCheck className="h-3 w-3" /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
