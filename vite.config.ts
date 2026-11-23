import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const API_PORT =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.API_PORT || "3301";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "logo.svg",
        "apple-touch-icon.png",
        "robots.txt",
        "fonts/noto-0.woff2",
        "fonts/noto-1.woff2",
      ],
      manifest: {
        id: "/",
        name: "আল-বারাকাহ স্টোর — হোলসেল ম্যানেজমেন্ট",
        short_name: "আল-বারাকাহ",
        description:
          "পাইকারি বিক্রয়, নগদ বাকি আদায়, স্টক, ক্রয়, সাপ্লায়ার, স্টাফ ও ক্যাশ বুক ম্যানেজমেন্ট অ্যাপ।",
        lang: "bn",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "any",
        background_color: "#f6f8fa",
        theme_color: "#059669",
        categories: ["business", "finance", "productivity"],
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "নতুন বিক্রয় (POS)",
            short_name: "নতুন বিক্রয়",
            url: "/sales/new",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "নগদ বাকি আদায়",
            short_name: "বাকি আদায়",
            url: "/collections",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "কাস্টমার তালিকা",
            short_name: "কাস্টমার",
            url: "/customers",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/robots\.txt$/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
          {
            urlPattern: /\.(?:woff2|woff)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "local-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:png|svg|ico|webp)$/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-media-cache",
              expiration: {
                maxEntries: 40,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  server: {
    port: 3000,
    host: true,
    headers: {
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
    },
    proxy: {
      "/api": `http://127.0.0.1:${API_PORT}`,
    },
  },
  preview: {
    port: 3000,
    host: true,
    headers: {
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
    },
  },
  build: {
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "lucide-react"],
        },
      },
    },
  },
});
