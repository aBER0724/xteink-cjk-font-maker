import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: path.resolve("web"),
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve("web/src"),
    },
  },
  build: {
    outDir: path.resolve("web/dist"),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
});
