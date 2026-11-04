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
            { url: "/", revision: null },
            { url: "/dashboard", revision: null },
            { url: "/history", revision: null },
            { url: "/assistant", revision: null },
            { url: "/how-it-works", revision: null },
            { url: "/fertility", revision: null },
            { url: "/settings", revision: null },
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
                plugins: [{
                  handlerDidError: async ({ request }) => {
                    // Installation precaches the public HTML shell for each
                    // supported offline page; private reads live in owner storage.
                    const path = new URL(request.url).pathname;
                    const response = await caches.match(path, { ignoreSearch: true });
                    if (response) return response;
                    return Response.error();
                  },
                }],
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
