/** Registers the app service worker only where it is safe (published site, top window). */
const SW_URL = "/sw.js";

function isBlockedContext() {
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  if (new URL(window.location.href).searchParams.get("sw") === "off") return true;
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  const blockedHosts = ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"];
  return blockedHosts.some((base) => h === base || h.endsWith(`.${base}`));
}

async function unregisterApp() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => (r.active?.scriptURL ?? r.installing?.scriptURL ?? "").endsWith(SW_URL))
      .map((r) => r.unregister()),
  );
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (isBlockedContext()) {
    void unregisterApp();
    return;
  }
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {});
  });
}
