import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// VITE_BASE lets the dev script set a subpath (e.g. /oss/) for Replit's
// path-based proxy. In a real Docker deployment VITE_BASE is unset so the
// app builds at the root (/) as normal.
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: Number(process.env.PORT ?? 5173),
    host: "0.0.0.0",
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
      "/card": { target: "http://localhost:3000", changeOrigin: true },
      "/.well-known": { target: "http://localhost:3000", changeOrigin: true },
      "/lnurlp": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
