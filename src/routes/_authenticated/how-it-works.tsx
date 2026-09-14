import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Thermometer, Activity, ShieldAlert, HeartPulse, BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/how-it-works")({
  head: () => ({
    meta: [
      { title: "How My Cycle AI works" },
      { name: "description", content: "The science behind My Cycle AI's fertility predictions: basal body temperature, the 3-over-6 rule, luteal phase detection, and the fertile window." },
      { property: "og:title", content: "How My Cycle AI works" },
      { property: "og:description", content: "The science behind My Cycle AI's fertility predictions: basal body temperature, the 3-over-6 rule, luteal phase detection, and the fertile window." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HowItWorks,
});

function HowItWorks() {
  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">How My Cycle AI predicts your fertility</h1>
        <p className="text-muted-foreground">
          My Cycle AI combines a simple body-signal — your morning temperature — with well-known fertility-awareness science.
        </p>
      </div>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Thermometer className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">1. Basal body temperature (BBT)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your resting body temperature is lower before ovulation and rises about 0.2–0.5°C after ovulation, because progesterone warms the body. To see this shift, we ask for a temperature first thing in the morning, before you sit up, talk, or drink anything.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">2. The 3-over-6 ovulation rule</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This is the classic rule used by fertility-awareness methods like Sensiplan:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                Find the <strong>coverline</strong> — the highest temperature among your 6 lowest pre-ovulation readings.
              </li>
              <li>
                Wait for <strong>3 temperatures that are all higher than the coverline</strong>, with at least one of them at least 0.2°C above it.
              </li>
              <li>
                <strong>Ovulation happened the day before the first of those 3 high temperatures.</strong>
              </li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              My Cycle AI tolerates a few missed days, so a gap of one or two blank readings does not break the rule.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <HeartPulse className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">3. Luteal phase detection</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              After ovulation, the body enters the luteal phase. The luteal phase is usually stable at about 14 days, even when the rest of the cycle varies. We look for a sustained cluster of higher temperatures after the coverline to confirm the luteal phase has begun, even if the strict 3-over-6 pattern is not complete.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">4. The fertile window</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The fertile window is the time pregnancy is possible. It is wider than just ovulation day:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                Sperm can survive in the body for <strong>up to 5 days</strong> in good cervical mucus.
              </li>
              <li>
                The egg is only viable for about <strong>12–24 hours</strong> after ovulation.
              </li>
              <li>
                So My Cycle AI marks the window as roughly <strong>5 days before ovulation through 1 day after</strong>.
              </li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Until ovulation is confirmed by a clear temperature rise, My Cycle AI keeps the red “treat as fertile” zone wider. Once the rise is confirmed, the fertile window closes and the days after turn green.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">5. Red and green days</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950/20">
                <p className="font-medium text-emerald-700 dark:text-emerald-400">Green — low fertility</p>
                <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-400/80">
                  Confirmed menstruation, confirmed post-ovulation luteal phase, or pre-fertile days backed by at least three completed cycles.
                </p>
              </div>
              <div className="rounded-xl bg-rose-50 p-4 dark:bg-rose-950/20">
                <p className="font-medium text-rose-700 dark:text-rose-400">Red — fertile or uncertain</p>
                <p className="mt-1 text-sm text-rose-700/80 dark:text-rose-400/80">
                  Inside the fertile window, or days where data is too limited to be confident. My Cycle AI defaults to red for safety.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Assumptions and references</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              My Cycle AI is inspired by fertility-awareness methods, not a medical device. The main assumptions are:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>The luteal phase is roughly 14 days long for most cycles.</li>
              <li>A sustained BBT rise of at least 0.2°C after ovulation is measurable.</li>
              <li>When cycle history is limited, the fertile window is widened to keep the prediction safe.</li>
              <li>Illness, poor sleep, alcohol, or late waking can raise BBT and should be excluded from calculations.</li>
            </ul>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>
                Learn more about fertility-awareness methods from{" "}
                <a
                  href="https://www.nhs.uk/contraception/natural-family-planning-fertility-awareness/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4"
                >
                  NHS natural family planning
                </a>
                {" "}and{" "}
                <a
                  href="https://www.who.int/news-room/fact-sheets/detail/fertility-awareness"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4"
                >
                  WHO fertility awareness
                </a>
                .
              </p>
              <p>
                For the research behind BBT and ovulation, see the overview on{" "}
                <a
                  href="https://www.ncbi.nlm.nih.gov/books/NBK470326/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4"
                >
                  NCBI StatPearls: Physiology, Ovulation
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
