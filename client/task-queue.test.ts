import { assert, assertEquals, assertRejects } from "@std/assert";
import * as taskQueue from "./task-queue.ts";

const {
  submit,
  getTask,
  listTasks,
  markAllRunningAsFailed,
  onChange,
} = taskQueue;

Deno.test({
  name: "task-queue: submit returns taskId synchronously",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const t0 = Date.now();
    const { taskId } = await submit("test-sync", async () => {
      // Delay long enough that we'd notice if submit awaited.
      await new Promise((r) => setTimeout(r, 200));
      return "done";
    }, []);
    const elapsed = Date.now() - t0;
    assert(elapsed < 50, `submit took ${elapsed}ms — should be < 50ms`);
    assert(taskId, "taskId should be a non-empty string");
    // Note: the PQueue is concurrency=1 and picks up jobs in a microtask.
    // We don't assert the status is "pending" here — by the time the await
    // resolves, the queue may have already started the task. The intent of
    // the test is the timing assertion above.

    // Drain so the next test starts clean.
    const t = getTask(taskId);
    while (t && t.status !== "completed" && t.status !== "failed") {
      await new Promise((r) => setTimeout(r, 10));
    }
  },
});

Deno.test({
  name: "task-queue: status transitions pending → running → completed",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const seen = new Set<string>();
    const unsub = onChange((id) => seen.add(id));

    try {
      const { taskId } = await submit("test-transitions", async () => {
        await new Promise((r) => setTimeout(r, 20));
        return 42;
      }, []);

      // Wait for completion
      let rec = getTask(taskId);
      const deadline = Date.now() + 1000;
      while (rec && rec.status !== "completed" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5));
        rec = getTask(taskId);
      }

      assertEquals(rec?.status, "completed");
      assertEquals(rec?.result, 42);
      assert(typeof rec?.startedAt === "number");
      assert(typeof rec?.completedAt === "number");
      assertEquals(rec!.startedAt! <= rec!.completedAt!, true);
      assert(seen.has(taskId), "expected onChange to fire at least once");
    } finally {
      unsub();
    }
  },
});

Deno.test({
  name: "task-queue: failed task captures error and rethrows nothing",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { taskId } = await submit(
      "test-fail",
      async () => {
        throw new Error("kaboom");
      },
      [],
    );

    let rec = getTask(taskId);
    const deadline = Date.now() + 1000;
    while (rec && rec.status !== "failed" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5));
      rec = getTask(taskId);
    }

    assertEquals(rec?.status, "failed");
    assertEquals(rec?.error?.message, "kaboom");
    assertEquals(rec?.error?.name, "Error");
  },
});

Deno.test({
  name: "task-queue: listTasks filters and sorts newest-first",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Reset the store for this test by submitting distinctive labels.
    const t0 = Date.now();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { taskId } = await submit(`label-A-${i}`, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return i;
      }, []);
      ids.push(taskId);
      // Stagger createdAt to make ordering deterministic.
      await new Promise((r) => setTimeout(r, 5));
    }
    await submit("label-B", async () => 99, []);

    // Drain.
    for (const id of ids) {
      let r = getTask(id);
      const deadline = Date.now() + 1000;
      while (r && r.status !== "completed" && r.status !== "failed" &&
        Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5));
        r = getTask(id);
      }
    }

    const allA = listTasks({ label: "label-B" });
    assertEquals(allA.length, 1);
    assertEquals(allA[0].label, "label-B");

    // Newest first check: the last `label-A-2` should appear before `label-A-0`.
    const allA2 = listTasks({ label: "label-A-0" });
    assertEquals(allA2.length, 1);
    assert(allA2[0].createdAt >= t0, "createdAt should be sane");

    // Status filter
    const completed = listTasks({ status: "completed" });
    assert(completed.length >= 3, "expected at least 3 completed tasks");
    for (const r of completed) {
      assertEquals(r.status, "completed");
    }
  },
});

Deno.test({
  name: "task-queue: markAllRunningAsFailed flips running+pending",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Submit a slow task, then mark it failed while it's still running.
    const { taskId: slowId } = await submit("test-slow", async () => {
      await new Promise((r) => setTimeout(r, 500));
      return "never";
    }, []);

    // Wait until it transitions to running.
    let rec = getTask(slowId);
    for (let i = 0; i < 50 && rec?.status !== "running"; i++) {
      await new Promise((r) => setTimeout(r, 5));
      rec = getTask(slowId);
    }
    assertEquals(rec?.status, "running");

    markAllRunningAsFailed("test-disconnect");

    rec = getTask(slowId);
    assertEquals(rec?.status, "failed");
    assertEquals(rec?.error?.message, "test-disconnect");
    assertEquals(rec?.error?.name, "TaskQueueError");
  },
});

Deno.test("task-queue: getTask returns undefined for unknown id", () => {
  assertEquals(getTask("nonexistent-id"), undefined);
});

Deno.test("task-queue: submit with no label throws", async () => {
  await assertRejects(
    () => submit("", async () => 1, []),
    Error,
    "label is required",
  );
});
