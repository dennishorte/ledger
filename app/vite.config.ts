import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transcriptMiddleware } from "./server/middleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_PORT = Number(process.env["LEDGER_APP_PORT"] ?? "4179");
const API_PORT = Number(process.env["LEDGER_API_PORT"] ?? "4180");

export default defineConfig({
  plugins: [react(), tailwindcss(), transcriptMiddleware()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: APP_PORT,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${String(API_PORT)}`,
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
    port: APP_PORT,
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
