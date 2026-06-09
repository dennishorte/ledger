import { test, expect } from "@playwright/test";

const API = "http://localhost:4180/api";

test.describe("Alert banner", () => {
  test("GET /api/alerts returns expected shape", async ({ request }) => {
    const res = await request.get(`${API}/alerts`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { alerts: unknown[] };
    expect(Array.isArray(body.alerts)).toBe(true);
  });

  test("no alert banner visible on initial load when no failures exist", async ({
    page,
    request,
  }) => {
    // Confirm no active alerts via API first
    const res = await request.get(`${API}/alerts`);
    const { alerts } = (await res.json()) as { alerts: unknown[] };

    if (alerts.length > 0) {
      test.skip(true, "Active alerts present — skipping no-banner assertion");
      return;
    }

    await page.goto("/dag");
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });

  test("alert banner renders and can be dismissed", async ({ page, request }) => {
    const res = await request.get(`${API}/alerts`);
    const { alerts } = (await res.json()) as { alerts: unknown[] };

    if (alerts.length === 0) {
      test.skip(
        true,
        "No active alerts to test dismiss flow — trigger a RUNNING→FAILED task via real dispatch to exercise this path",
      );
      return;
    }

    await page.goto("/dag");
    const banner = page.locator('[role="alert"]').first();
    await expect(banner).toBeVisible({ timeout: 5_000 });

    const dismissBtn = banner.locator('button[aria-label="Dismiss alert"]');
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();
    await expect(banner).toBeHidden({ timeout: 3_000 });
  });
});
