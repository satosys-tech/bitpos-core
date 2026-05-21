import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
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
