/** Registers the app service worker only where it is safe (published site, top window). */
import { blockAppWorker } from "@/lib/pwa-context";
const SW_URL = "/sw.js";

function isBlockedContext() {
  return blockAppWorker(window.location.hostname, import.meta.env.PROD, window.self !== window.top,
    new URL(window.location.href).searchParams.get("sw") === "off");
}

async function unregisterApp() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => [r.active, r.installing, r.waiting].some((worker) => worker && new URL(worker.scriptURL).pathname === SW_URL))
      .map((r) => r.unregister()),
  );
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (isBlockedContext()) {
    void unregisterApp();
    return;
  }
  const register = () => {
    void navigator.serviceWorker.register(SW_URL, { scope: "/" }).then((registration) => {
      void registration.update();
    }).catch(() => {});
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
