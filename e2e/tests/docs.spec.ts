import { test, expect } from "@playwright/test";

test.describe("Docs panel", () => {
  test('loads and shows the "Documents" heading', async ({ page }) => {
    await page.goto("/docs");
    await expect(page.locator("h1", { hasText: "Documents" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("renders at least one doc node row", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.locator("h1", { hasText: "Documents" })).toBeVisible({
      timeout: 10_000,
    });
    // Each tree row links to /docs/<nodeId>
    await expect(page.locator('a[href^="/docs/"]').first()).toBeVisible();
  });

  test("clicking a doc row navigates to the viewer", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.locator("h1", { hasText: "Documents" })).toBeVisible({
      timeout: 10_000,
    });
    const firstLink = page.locator('a[href^="/docs/"]').first();
    await firstLink.click();
    // URL should change to /docs/:nodeId
    await expect(page).toHaveURL(/\/docs\/.+/);
  });

  test("doc viewer renders markdown body", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.locator("h1", { hasText: "Documents" })).toBeVisible({
      timeout: 10_000,
    });
    await page.locator('a[href^="/docs/"]').first().click();
    await expect(page).toHaveURL(/\/docs\/.+/);
    // Markdown body renders inside a prose container; wait for any text content
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 10_000 });
  });
});
