import { test, expect, seedTask, waitForTaskStatus } from "../fixtures/index.js";

test.describe("Tasks panel — smoke", () => {
  test("loads without crashing", async ({ page }) => {
    await page.goto("/tasks");
    // Either task list or an empty-state message renders
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 10_000 });
  });
});

test.describe("Tasks panel — HITL approve flow", () => {
  test("seeded human_review task reaches AWAITING_HUMAN_REVIEW", async ({
    request,
  }) => {
    const task = await seedTask(request, {
      type: "human_review",
      title: "e2e: HITL approve test",
      source: "operator_injected",
    });
    expect(task.id).toBeTruthy();

    const advanced = await waitForTaskStatus(
      request,
      task.id,
      "AWAITING_HUMAN_REVIEW",
    );
    expect(advanced.status).toBe("AWAITING_HUMAN_REVIEW");
  });

  test("Approve button appears and approves the task", async ({
    page,
    request,
  }) => {
    const task = await seedTask(request, {
      type: "human_review",
      title: "e2e: HITL approve UI test",
      source: "operator_injected",
    });
    await waitForTaskStatus(request, task.id, "AWAITING_HUMAN_REVIEW");

    await page.goto("/tasks");
    // TaskRow renders task.title — find by the seeded title
    const taskRow = page.locator(`text=e2e: HITL approve UI test`).first();
    await expect(taskRow).toBeVisible({ timeout: 10_000 });
    await taskRow.click();

    const inspector = page.locator('aside[aria-label="Inspector"]');
    await expect(inspector).toBeVisible();

    const approveBtn = inspector.locator('button', { hasText: "Approve" });
    await expect(approveBtn).toBeVisible({ timeout: 5_000 });
    await approveBtn.click();

    // After approval the button should disappear (task moves to COMPLETE)
    await expect(approveBtn).toBeHidden({ timeout: 5_000 });
    const completed = await waitForTaskStatus(request, task.id, "COMPLETE");
    expect(completed.status).toBe("COMPLETE");
  });

  test("Reject flow shows rationale textarea and rejects the task", async ({
    page,
    request,
  }) => {
    const task = await seedTask(request, {
      type: "human_review",
      title: "e2e: HITL reject UI test",
      source: "operator_injected",
    });
    await waitForTaskStatus(request, task.id, "AWAITING_HUMAN_REVIEW");

    await page.goto("/tasks");
    // TaskRow renders task.title — find by the seeded title
    const taskRow = page.locator(`text=e2e: HITL reject UI test`).first();
    await expect(taskRow).toBeVisible({ timeout: 10_000 });
    await taskRow.click();

    const inspector = page.locator('aside[aria-label="Inspector"]');
    await expect(inspector).toBeVisible();

    const rejectBtn = inspector.locator('button', { hasText: /reject/i });
    await expect(rejectBtn).toBeVisible({ timeout: 5_000 });
    await rejectBtn.click();

    // Rejection rationale textarea should appear
    const textarea = inspector.locator('textarea, [role="textbox"]').first();
    await expect(textarea).toBeVisible({ timeout: 3_000 });
    await textarea.fill("e2e rejection reason");

    // Confirm / submit rejection
    const confirmBtn = inspector.locator('button', {
      hasText: /confirm|submit/i,
    });
    await expect(confirmBtn).toBeEnabled({ timeout: 3_000 });
    await confirmBtn.click();

    await expect(rejectBtn).toBeHidden({ timeout: 5_000 });
    const rejected = await waitForTaskStatus(request, task.id, "FAILED");
    expect(rejected.status).toBe("FAILED");
  });
});
