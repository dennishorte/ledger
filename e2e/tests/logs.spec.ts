import { test, expect } from "../fixtures/index.js";

test.describe("Logs panel", () => {
  test("renders log stream for a known task", async ({
    page,
    seedTask,
    waitForTaskStatus,
  }) => {
    const task = await seedTask({
      type: "noop",
      title: "e2e: log stream test",
      source: "operator_injected",
    });

    // Let the noop executor run so there are events to show
    await waitForTaskStatus(task.id, "COMPLETE");

    await page.goto(`/logs/${encodeURIComponent(task.id)}`);
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 10_000 });
  });

  test("log stream page renders without crashing for an unknown task", async ({
    page,
  }) => {
    await page.goto("/logs/nonexistent-task-id");
    // Should render some UI (empty state or error) rather than blank
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 10_000 });
  });
});
