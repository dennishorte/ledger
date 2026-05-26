import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transcriptMiddleware } from "./server/middleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), transcriptMiddleware()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 4179,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4180",
        changeOrigin: false,
      },
    },
    fs: {
      // Allow reading files outside the app/ root so we can `?raw` import
      // markdown from ../docs at module evaluation time. See 01-ui/02-dag.md
      // Design > Data source.
      allow: [path.resolve(__dirname, "..")],
    },
  },
  preview: {
    port: 4179,
    strictPort: true,
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(
      process.env.npm_package_version ?? "0.0.0",
    ),
  },
  test: {
    projects: [
      {
        // Server-side tests (Node environment): transcriptParse.test.ts
        test: {
          name: "server",
          include: ["server/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        // Client-side tests (jsdom environment): React component tests
        plugins: [react()],
        test: {
          name: "client",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
        },
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
          },
        },
        server: {
          fs: {
            // Allow reading docs/**/*.md?raw in test environment (same as dev server).
            allow: [path.resolve(__dirname, "..")],
          },
        },
      },
    ],
  },
});
