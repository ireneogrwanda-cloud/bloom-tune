import { createFileRoute } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/fertility")({
  head: () => ({
    meta: [
      { title: "Fertility explained — My Cycle AI" },
      {
        name: "description",
        content: "What the fertile window, ovulation and the luteal phase mean, and how temperature confirms them.",
      },
      { property: "og:title", content: "Fertility explained — My Cycle AI" },
      { property: "og:description", content: "Understand your fertile window, ovulation and luteal phase." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FertilityPage,
});

const SECTIONS = [
  {
    title: "The period (bleeding days)",
    body: "Your cycle starts on the first day of real bleeding. Pregnancy chance during these days is very low, but it is only shown as a confirmed green day when your cycle history is long enough to be sure.",
  },
  {
    title: "The follicular phase",
    body: "After bleeding, an egg matures. Temperatures stay at a low, fairly flat baseline. As the days get closer to ovulation, the app widens caution and the calendar turns light red — sperm can survive up to five days, so these days count as fertile.",
  },
  {
    title: "The fertile window",
    body: "About five days before ovulation up to one day after it. This is the only time pregnancy is possible, and it is painted red on your calendar.",
  },
  {
    title: "Ovulation",
    body: "The egg is released and lives 12–24 hours. It is marked with an egg icon on the calendar. We confirm it afterwards from your temperatures, not from the calendar alone.",
  },
  {
    title: "The luteal phase",
    body: "After ovulation, progesterone raises your morning temperature by roughly 0.2–0.5 °C and keeps it up until your next period. Once three readings in a row stay above the previous six, ovulation is confirmed and the rest of the cycle turns green — confirmed infertile.",
  },
  {
    title: "Why some days are light and some are strong",
    body: "Strong green or red means confirmed by your own data. Light green or light red means predicted from your cycle history — those days can still move as you log more temperatures.",
  },
];

function FertilityPage() {
  const { t } = useT();
  return (
    <article className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{t("Fertility explained")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("A short guide to what each phase means and what the colours on your calendar tell you.")}
      </p>
      {SECTIONS.map((s) => (
        <section key={s.title} className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">{t(s.title)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(s.body)}</p>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        {t("Predictions can change with every new daily temperature. Take your temperature first thing in the morning, before getting out of bed, at roughly the same time each day.")}
      </p>
    </article>
  );
}
