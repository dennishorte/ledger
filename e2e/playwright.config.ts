import { defineConfig, devices } from "@playwright/test";
import path from "path";

const projectRoot = path.resolve(__dirname, "..");
const serverDir = path.resolve(__dirname, "..", "server");
const appDir = path.resolve(__dirname, "..", "app");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: [["html", { outputFolder: "test-results/html", open: "never" }]],
  outputDir: "test-results/artifacts",

  use: {
    baseURL: "http://localhost:4179",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: `pnpm -C ${serverDir} dev ${projectRoot}`,
      url: "http://127.0.0.1:4180/api/_health",
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `pnpm -C ${appDir} dev`,
      url: "http://localhost:4179",
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
