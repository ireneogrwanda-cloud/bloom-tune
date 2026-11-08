// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  // Vercel sets VERCEL=1 during its build; Lovable keeps its managed runtime.
  nitro: { preset: process.env.VERCEL ? "vercel" : "cloudflare-module" },
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        devOptions: { enabled: false },
        manifest: false,
        workbox: {
          globDirectory: "dist/client",
          globPatterns: ["**/*.{js,css,woff2,png,svg,webmanifest}"],
          globIgnores: ["firebase-messaging-sw.js"],
          additionalManifestEntries: [
            ...["/", "/dashboard", "/history", "/assistant", "/how-it-works", "/fertility", "/settings"].map((path) => ({
              // A separate URL keeps normal page navigations out of Workbox's
              // cache-first precache route. Only NetworkFirst fallback uses it.
              url: `${path}?offline-shell=1`, revision: String(Date.now()),
            })),
          ],
          // HTML is handled by NetworkFirst below, not the precache handler.
          // These shell-only SSR pages contain no authenticated cycle data.
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: ({ request, url, sameOrigin }) =>
                sameOrigin && request.mode === "navigate" &&
                !url.pathname.startsWith("/~oauth") && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/_serverFn/"),
              handler: "NetworkFirst",
              options: {
                cacheName: "html-navigations", networkTimeoutSeconds: 5,
                precacheFallback: { fallbackURL: "/?offline-shell=1" },
              },
            },
            {
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin && /^\/assets\/[^/]+-[a-zA-Z0-9_-]{8,}\.[^/]+$/.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "static-assets",
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
  },
});
