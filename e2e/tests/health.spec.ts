import { test, expect } from "@playwright/test";

const API = "http://localhost:4180/api";

test.describe("Health panel", () => {
  test('loads and shows the "Health Scans" heading', async ({ page }) => {
    await page.goto("/health");
    await expect(
      page.locator("h2", { hasText: "Health Scans" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('"Run Scan" button is present', async ({ page }) => {
    await page.goto("/health");
    await expect(
      page.locator("button", { hasText: "Run Scan" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clicking Run Scan triggers a scan and renders results", async ({
    page,
  }) => {
    await page.goto("/health");
    const scanBtn = page.locator("button", { hasText: /run scan/i });
    await expect(scanBtn).toBeVisible({ timeout: 10_000 });
    await scanBtn.click();

    // Button enters pending state
    await expect(
      page.locator("button", { hasText: /scanning/i }),
    ).toBeVisible({ timeout: 5_000 });

    // After scan completes, either findings table or "No findings" message
    await expect(
      page
        .locator("text=No findings")
        .or(page.locator("table"))
        .or(page.locator("text=findings"))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("POST /api/health/scan returns a scan result", async ({ request }) => {
    const res = await request.post(`${API}/health/scan`);
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { findings: unknown[] };
    expect(Array.isArray(body.findings)).toBe(true);
  });

  test("GET /api/health/scans returns scan history array", async ({ request }) => {
    const res = await request.get(`${API}/health/scans`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as unknown;
    expect(Array.isArray(body)).toBe(true);
  });
});
