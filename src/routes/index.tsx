import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MessageCircle, ThermometerSun, Sparkles, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mira — WhatsApp fertility & cycle assistant" },
      {
        name: "description",
        content:
          "Log your daily basal body temperature on WhatsApp and get instant fertility-window predictions powered by AI.",
      },
      { property: "og:title", content: "Mira — WhatsApp fertility & cycle assistant" },
      {
        property: "og:description",
        content:
          "Track BBT, identify your fertile window, and chat with an AI bot — right from WhatsApp.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 via-background to-background">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white text-sm">M</span>
          Mira
        </div>
        <nav className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
          <Button asChild size="sm"><Link to="/signup">Get started</Link></Button>
        </nav>
      </header>

      <main className="container mx-auto px-6 pb-20">
        <section className="grid gap-10 py-16 md:grid-cols-2 md:items-center">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700">
              <MessageCircle className="h-3 w-3" /> Now on WhatsApp
            </span>
            <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Know your fertile window — one WhatsApp message a day.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Send your morning basal body temperature to our bot. Get back your cycle day,
              an AI-written interpretation, and a clear fertile-vs-infertile prediction.
            </p>
            <div className="mt-6 flex gap-3">
              <Button asChild size="lg"><Link to="/signup">Create free account</Link></Button>
              <Button asChild variant="outline" size="lg"><Link to="/login">I have an account</Link></Button>
            </div>
            <div className="mt-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p><strong>Not medical advice.</strong> Mira helps you observe patterns. It is not a contraceptive method and should not replace a clinician.</p>
            </div>
          </div>
          <div className="rounded-3xl border bg-white p-4 shadow-xl">
            <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-violet-50 p-4">
              <ChatPreview />
            </div>
          </div>
        </section>

        <section className="grid gap-6 py-10 md:grid-cols-3">
          <Feature icon={<ThermometerSun className="h-5 w-5" />} title="Daily BBT logging">
            Reply with a number like <code>36.7</code> — that's it. The bot stores it, charts it, and refines your prediction.
          </Feature>
          <Feature icon={<Sparkles className="h-5 w-5" />} title="AI interpretation">
            Each reply includes a short, plain-language read on what today's temperature means for your cycle.
          </Feature>
          <Feature icon={<MessageCircle className="h-5 w-5" />} title="Cycle threads">
            Every cycle starts a new thread, so you can look back at past patterns from the dashboard.
          </Feature>
        </section>
      </main>

      <footer className="border-t bg-muted/30">
        <div className="container mx-auto px-6 py-6 text-xs text-muted-foreground">
          <p><strong>Disclaimer:</strong> Mira is an educational fertility-awareness tool. It is not a contraceptive method, not a diagnostic device, and not a substitute for professional medical advice. If you are trying to conceive, avoid pregnancy, or have concerns about your cycle, consult a qualified healthcare provider.</p>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-rose-700">{icon}</div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function ChatPreview() {
  return (
    <div className="space-y-2 text-sm">
      <Bubble side="right">36.55</Bubble>
      <Bubble side="left">
        ✅ Logged 36.55°C for cycle day 12.
        <br /><br />
        Day 12. You're in your fertile window. Ovulation expected around day 14.
        <br /><br />
        🌱 Fertile window: days 9–15
      </Bubble>
      <Bubble side="right">status</Bubble>
      <Bubble side="left">
        📊 Cycle started 2026-05-06 · 4 logs this cycle. Estimated ovulation: day 14.
      </Bubble>
    </div>
  );
}

function Bubble({ side, children }: { side: "left" | "right"; children: React.ReactNode }) {
  const right = side === "right";
  return (
    <div className={right ? "flex justify-end" : "flex justify-start"}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${right ? "bg-emerald-500 text-white" : "bg-white shadow-sm"}`}>
        {children}
      </div>
    </div>
  );
}
