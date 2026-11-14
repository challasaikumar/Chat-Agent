import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        // Agent SSE can run for minutes; do not let the proxy cut it off.
        timeout: 0,
        proxyTimeout: 0,
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes, req) => {
            const url = req.url ?? "";
            if (url.includes("/turn/stream") || url.includes("text/event-stream")) {
              proxyRes.headers["cache-control"] = "no-cache, no-transform";
              proxyRes.headers["x-accel-buffering"] = "no";
              // Prevent Node's http-proxy from buffering the stream body.
              delete proxyRes.headers["content-length"];
            }
          });
        },
      },
    },
  },
});
