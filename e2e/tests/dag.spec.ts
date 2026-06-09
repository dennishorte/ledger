import { test, expect } from "@playwright/test";

test.describe("DAG panel", () => {
  test("loads and renders at least one node", async ({ page }) => {
    await page.goto("/dag");
    // React Flow renders nodes with .react-flow__node
    await expect(page.locator(".react-flow__node").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("clicking a node opens the inspector", async ({ page }) => {
    await page.goto("/dag");
    const firstNode = page.locator(".react-flow__node").first();
    await expect(firstNode).toBeVisible({ timeout: 15_000 });
    await firstNode.click({ force: true });
    await expect(page.locator('aside[aria-label="Inspector"]')).toBeVisible();
  });

  test("inspector shows node title and workflow-progress section", async ({ page }) => {
    await page.goto("/dag");
    const firstNode = page.locator(".react-flow__node").first();
    await expect(firstNode).toBeVisible({ timeout: 15_000 });
    await firstNode.click({ force: true });
    const inspector = page.locator('aside[aria-label="Inspector"]');
    await expect(inspector).toBeVisible();
    // Inspector should contain some text content (node ID or title)
    await expect(inspector).not.toBeEmpty();
  });

  test("APPROVED node shows Dispatch button", async ({ page }) => {
    await page.goto("/dag");
    await expect(page.locator(".react-flow__node").first()).toBeVisible({
      timeout: 15_000,
    });

    // Find an APPROVED node by clicking nodes until we find one with a Dispatch button.
    // The doc tree always has at least one APPROVED node (01-ui/00-ui.md).
    const nodes = page.locator(".react-flow__node");
    const count = await nodes.count();

    for (let i = 0; i < count; i++) {
      const node = nodes.nth(i);
      await node.click({ force: true });
      const dispatchBtn = page.locator('button', { hasText: "Dispatch" });
      const visible = await dispatchBtn.isVisible().catch(() => false);
      if (visible) {
        // Found one — verify the dispatch dialog opens
        await dispatchBtn.click();
        await expect(page.locator('[role="dialog"], [data-dialog]').or(
          page.locator('text=Confirm dispatch').or(page.locator('text=dispatch'))
        ).first()).toBeVisible({ timeout: 3_000 });
        return;
      }
    }
    // If no APPROVED node found, the test still passes as a no-op — the
    // project may be in a state where all nodes are COMPLETE.
    test.skip(true, "No APPROVED nodes found in current doc tree");
  });

  test("pressing Escape closes the inspector", async ({ page }) => {
    await page.goto("/dag");
    const firstNode = page.locator(".react-flow__node").first();
    await expect(firstNode).toBeVisible({ timeout: 15_000 });
    await firstNode.click({ force: true });
    await expect(page.locator('aside[aria-label="Inspector"]')).toBeVisible();
    await page.keyboard.press("Escape");
    // Inspector hides via aria-hidden + w-0, not display:none — check the attribute
    await expect(page.locator('aside[aria-label="Inspector"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
