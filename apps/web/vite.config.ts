import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Never cache HTML for tile/data URLs: a missing file used to be answered with the SPA's
 * index.html (status 200), which then stuck in the cache and hid the tiles for good.
 */
const rejectHtml = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.status === 200 && !(response.headers.get("content-type") ?? "").includes("text/html")
      ? response
      : null,
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? "dev"),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Streetwise – Straßennamen lernen",
        short_name: "Streetwise",
        description: "Lerne die Straßennamen deiner Stadt auf einer Karte ohne Beschriftung.",
        lang: "de",
        theme_color: "#0b1220",
        background_color: "#0b1220",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // App shell is precached; city data and tiles are cached at runtime (M5 adds explicit district downloads).
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        globIgnores: ["**/data/**", "**/tiles/**"],
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          // tiles.json decides whether tiles exist: always ask the network first.
          {
            urlPattern: ({ url }) => url.pathname.endsWith("/tiles.json"),
            handler: "NetworkFirst",
            options: { cacheName: "tiles-meta-v2", plugins: [rejectHtml] },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/tiles/"),
            handler: "CacheFirst",
            options: {
              cacheName: "tiles-v2",
              expiration: { maxEntries: 5000 },
              plugins: [rejectHtml],
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/data/"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "city-data-v2", plugins: [rejectHtml] },
          },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1200 },
  worker: { format: "es" },
  server: {
    proxy: { "/api": "http://localhost:8788" },
  },
});
