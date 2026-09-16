import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { Download, Share, ShieldCheck, CalendarDays, Bot, LineChart } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "My Cycle AI — your cycle calendar and fertile days" },
      {
        name: "description",
        content:
          "Track your morning basal body temperature on a colour-coded monthly calendar and know your fertile and infertile days.",
      },
      { property: "og:title", content: "My Cycle AI — your cycle calendar and fertile days" },
      {
        property: "og:description",
        content: "A colour-coded cycle calendar that turns your daily temperature into clear fertile and infertile days.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Signed-in users always land on their calendar dashboard.
  useEffect(() => {
    if (authed) nav({ to: "/dashboard" });
  }, [authed, nav]);

  if (authed !== false) {
    return <div className="flex min-h-[100dvh] items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-accent/40 via-background to-background">
      <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-5 py-8">
        <InstallBanner />
        <header className="flex items-center gap-3">
          <img src="/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 rounded-2xl" />
          <div>
            <h1 className="text-xl font-bold">My Cycle AI</h1>
            <p className="text-xs text-muted-foreground">fertility tracking from your morning temperature</p>
          </div>
        </header>

        <section className="mt-8 space-y-4">
          <h2 className="text-2xl font-bold leading-snug">
            Your cycle on a calendar you can read in a second.
          </h2>
          <Feature icon={CalendarDays} title="Colour-coded calendar">
            Green for infertile days, red for fertile ones — strong when confirmed by your temperatures, light when
            still predicted. Tap a day to log its temperature.
          </Feature>
          <Feature icon={LineChart} title="Ovulation you can trust">
            We confirm ovulation from three sustained elevated readings, not from the calendar alone.
          </Feature>
          <Feature icon={Bot} title="An assistant that answers">
            Ask anything about your cycle, in the app or on WhatsApp — same history, same predictions.
          </Feature>
        </section>

        <div className="mt-8 rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium">Get started</p>
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
            This app helps you track fertility patterns. Predictions can change with each daily temperature.
          </p>
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof CalendarDays;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border bg-card p-4">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function InstallBanner() {
  const { canInstall, showIosHint, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || (!canInstall && !showIosHint)) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-accent px-4 py-2 text-accent-foreground">
      <img src="/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" loading="lazy" />
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-medium">Add My Cycle AI to your home screen</p>
        {showIosHint ? (
          <p className="flex items-center gap-1 text-[11px] opacity-80">
            Tap <Share className="h-3 w-3" /> then “Add to Home Screen”
          </p>
        ) : (
          <p className="text-[11px] opacity-80">Opens full screen, just like an app.</p>
        )}
      </div>
      {canInstall ? (
        <Button size="sm" className="h-8" onClick={() => void install()}>
          <Download className="mr-1 h-4 w-4" /> Install
        </Button>
      ) : null}
      <button onClick={() => setDismissed(true)} aria-label="Dismiss install banner" className="text-lg leading-none opacity-60">
        ×
      </button>
    </div>
  );
}
