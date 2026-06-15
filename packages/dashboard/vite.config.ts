import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/jobs": "http://localhost:3000",
      "/webhooks": "http://localhost:3000",
      "/approvals": "http://localhost:3000",
      "/agent-templates": "http://localhost:3000",
      "/credentials": "http://localhost:3000",
      "/repo-mappings": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
