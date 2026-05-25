import { defineConfig } from "vite";
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
});
