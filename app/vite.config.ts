import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 4179,
    strictPort: true,
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
