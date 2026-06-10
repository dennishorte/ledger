import { test as base, type APIRequestContext } from "@playwright/test";

const API = "http://localhost:4180/api";

export interface TaskSeed {
  type: string;
  title: string;
  source?: string;
  priority?: number;
}

export interface CreatedTask {
  id: string;
  type: string;
  status: string;
  title: string;
}

export async function seedTask(
  request: APIRequestContext,
  input: TaskSeed,
): Promise<CreatedTask> {
  const res = await request.post(`${API}/tasks`, { data: input });
  if (!res.ok()) {
    throw new Error(`seedTask failed ${res.status()}: ${await res.text()}`);
  }
  const body = (await res.json()) as { task: CreatedTask };
  return body.task;
}

export async function deleteTask(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(`${API}/tasks/${id}`);
}

export async function getTask(
  request: APIRequestContext,
  id: string,
): Promise<CreatedTask> {
  const res = await request.get(`${API}/tasks/${id}`);
  if (!res.ok()) {
    throw new Error(`getTask failed ${res.status()}: ${await res.text()}`);
  }
  const body = (await res.json()) as { task: CreatedTask };
  return body.task;
}

export async function waitForTaskStatus(
  request: APIRequestContext,
  id: string,
  status: string,
  timeoutMs = 10_000,
): Promise<CreatedTask> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = await getTask(request, id);
    if (task.status === status) return task;
    await new Promise((r) => setTimeout(r, 200));
  }
  const task = await getTask(request, id);
  throw new Error(
    `waitForTaskStatus: task ${id} still ${task.status}, wanted ${status} after ${timeoutMs}ms`,
  );
}

// Extended test fixture: seedTask auto-tracks created IDs and deletes them after each test.
export const test = base.extend<{
  seedTask: (input: TaskSeed) => Promise<CreatedTask>;
  waitForTaskStatus: (id: string, status: string, timeoutMs?: number) => Promise<CreatedTask>;
}>({
  seedTask: async ({ request }, use) => {
    const created: string[] = [];
    await use(async (input) => {
      const task = await seedTask(request, input);
      created.push(task.id);
      return task;
    });
    await Promise.all(created.map((id) => deleteTask(request, id)));
  },
  waitForTaskStatus: async ({ request }, use) => {
    await use((id, status, timeoutMs) =>
      waitForTaskStatus(request, id, status, timeoutMs),
    );
  },
});

export { expect } from "@playwright/test";
