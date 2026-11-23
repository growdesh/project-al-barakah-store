import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3300,
    host: true,
    proxy: {
      "/api": "http://127.0.0.1:3301",
    },
  },
  preview: {
    port: 3300,
    host: true,
  },
  build: {
    emptyOutDir: true,
  },
});
