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
      title: "e2e: HITL status check",
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
    // Unique suffix prevents accumulated tasks from previous runs matching first()
    const uid = Math.random().toString(36).slice(2, 8);
    const title = `e2e: HITL approve ${uid}`;
    const task = await seedTask(request, {
      type: "human_review",
      title,
      source: "operator_injected",
    });
    await waitForTaskStatus(request, task.id, "AWAITING_HUMAN_REVIEW");

    await page.goto("/tasks");
    const taskRow = page.locator(`text=${title}`).first();
    await expect(taskRow).toBeVisible({ timeout: 10_000 });
    await taskRow.click();

    const inspector = page.locator('aside[aria-label="Inspector"]');
    await expect(inspector).toBeVisible();

    const approveBtn = inspector.locator("button", { hasText: "Approve" });
    await expect(approveBtn).toBeVisible({ timeout: 5_000 });
    await approveBtn.click();

    // After approval the button disappears (task moves to COMPLETE)
    await expect(approveBtn).toBeHidden({ timeout: 5_000 });
    const completed = await waitForTaskStatus(request, task.id, "COMPLETE");
    expect(completed.status).toBe("COMPLETE");
  });

  test("Reject flow shows rationale textarea and rejects the task", async ({
    page,
    request,
  }) => {
    const uid = Math.random().toString(36).slice(2, 8);
    const title = `e2e: HITL reject ${uid}`;
    const task = await seedTask(request, {
      type: "human_review",
      title,
      source: "operator_injected",
    });
    await waitForTaskStatus(request, task.id, "AWAITING_HUMAN_REVIEW");

    await page.goto("/tasks");
    const taskRow = page.locator(`text=${title}`).first();
    await expect(taskRow).toBeVisible({ timeout: 10_000 });
    await taskRow.click();

    const inspector = page.locator('aside[aria-label="Inspector"]');
    await expect(inspector).toBeVisible();

    const rejectBtn = inspector.locator("button", { hasText: /reject/i });
    await expect(rejectBtn).toBeVisible({ timeout: 5_000 });
    await rejectBtn.click();

    // Rejection rationale textarea appears
    const textarea = inspector.locator("textarea, [role='textbox']").first();
    await expect(textarea).toBeVisible({ timeout: 3_000 });
    await textarea.fill("e2e rejection reason");

    // Confirm button is gated on non-empty rationale
    const confirmBtn = inspector.locator("button", {
      hasText: /confirm|submit/i,
    });
    await expect(confirmBtn).toBeEnabled({ timeout: 3_000 });
    await confirmBtn.click();

    await expect(rejectBtn).toBeHidden({ timeout: 5_000 });
    const rejected = await waitForTaskStatus(request, task.id, "FAILED");
    expect(rejected.status).toBe("FAILED");
  });
});
