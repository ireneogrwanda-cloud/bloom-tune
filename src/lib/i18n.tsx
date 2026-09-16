import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { translateUi } from "@/lib/translate.functions";

export const LANGUAGES = [
  { code: "English", label: "English" },
  { code: "Kinyarwanda", label: "Kinyarwanda" },
  { code: "French", label: "Français" },
  { code: "Swahili", label: "Kiswahili" },
  { code: "Spanish", label: "Español" },
  { code: "Portuguese", label: "Português" },
  { code: "Arabic", label: "العربية" },
] as const;

const STORAGE_KEY = "app_language";
const cacheKey = (lang: string) => `ui_i18n:${lang}`;

type Ctx = {
  lang: string;
  setLang: (lang: string) => void;
  t: (text: string) => string;
};

const I18nContext = createContext<Ctx>({ lang: "English", setLang: () => {}, t: (s) => s });

export function useT() {
  return useContext(I18nContext);
}

/** Translate a single piece of English interface copy. */
export function T({ children }: { children: string }) {
  const { t } = useT();
  return <>{t(children)}</>;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState("English");
  const [dict, setDict] = useState<Record<string, string>>({});
  const pending = useRef<Set<string>>(new Set());
  const inFlight = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore the saved language (and its cached translations) after hydration.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && saved !== "English") {
      setLangState(saved);
      try {
        setDict(JSON.parse(window.localStorage.getItem(cacheKey(saved)) ?? "{}"));
      } catch {
        setDict({});
      }
    }
  }, []);

  const flush = useCallback(
    async (target: string) => {
      const texts = Array.from(pending.current).slice(0, 60);
      if (!texts.length || target === "English") return;
      texts.forEach((x) => {
        pending.current.delete(x);
        inFlight.current.add(x);
      });
      try {
        const out = await translateUi({ data: { lang: target, texts } });
        setDict((prev) => {
          const next = { ...prev };
          texts.forEach((src, i) => {
            next[src] = out[i] ?? src;
          });
          try {
            window.localStorage.setItem(cacheKey(target), JSON.stringify(next));
          } catch {
            /* quota — keep the in-memory copy */
          }
          return next;
        });
      } catch {
        /* keep English on failure */
      } finally {
        texts.forEach((x) => inFlight.current.delete(x));
        if (pending.current.size) void flush(target);
      }
    },
    [],
  );

  const t = useCallback(
    (text: string) => {
      if (lang === "English" || !text?.trim()) return text;
      const hit = dict[text];
      if (hit) return hit;
      if (!pending.current.has(text) && !inFlight.current.has(text)) {
        pending.current.add(text);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(lang), 250);
      }
      return text;
    },
    [lang, dict, flush],
  );

  const setLang = useCallback((next: string) => {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    pending.current.clear();
    inFlight.current.clear();
    if (next === "English") {
      setDict({});
      return;
    }
    try {
      setDict(JSON.parse(window.localStorage.getItem(cacheKey(next)) ?? "{}"));
    } catch {
      setDict({});
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
