// ──────────────────────────────────────────────────────────────────────────────
// In-memory task queue. Layers ABOVE the existing browser PQueue
// (`client/browser.ts`): the PQueue still serializes browser ops at
// concurrency=1, this module adds task visibility, status tracking, and the
// ability to query / list work that was submitted earlier.
//
// `submit` returns immediately with a taskId; the work runs in the background
// behind the browser PQueue. Use `getTask` / `listTasks` to observe progress.
//
// `markAllRunningAsFailed` is invoked from `client/connect.ts` on browser
// disconnect to flip in-flight records to `failed` so polling callers learn
// about the drop instead of waiting forever.
// ──────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from "eventemitter3";
import { enqueueBrowserOperation } from "./browser.ts";
import { log } from "../libs/logger.ts";

const MAX_TASKS = 1000;

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface TaskRecord<TArgs = unknown, TValue = unknown> {
  id: string;
  label: string;
  args: TArgs;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: TValue;
  error?: { name: string; message: string; stack?: string };
}

export interface TaskListFilter {
  status?: TaskStatus;
  label?: string;
}

const store = new Map<string, TaskRecord>();
const emitter = new EventEmitter();

function evictIfOverCap(): void {
  if (store.size <= MAX_TASKS) return;

  // First pass: drop oldest terminal records (completed | failed | cancelled).
  const terminal: string[] = [];
  for (const [id, record] of store.entries()) {
    if (
      record.status === "completed" || record.status === "failed" ||
      record.status === "cancelled"
    ) {
      terminal.push(id);
    }
  }
  terminal.sort((a, b) => store.get(a)!.createdAt - store.get(b)!.createdAt);
  for (const id of terminal) {
    if (store.size <= MAX_TASKS) return;
    store.delete(id);
  }

  // Second pass: still over cap, drop oldest in-flight records.
  if (store.size > MAX_TASKS) {
    const inflight: string[] = [];
    for (const [id, record] of store.entries()) {
      if (record.status === "running" || record.status === "pending") {
        inflight.push(id);
      }
    }
    inflight.sort((a, b) => store.get(a)!.createdAt - store.get(b)!.createdAt);
    for (const id of inflight) {
      if (store.size <= MAX_TASKS) return;
      store.delete(id);
    }
  }
}

async function runTask<TArgs extends unknown[], TValue>(
  id: string,
  label: string,
  impl: (...args: TArgs) => Promise<TValue>,
  args: TArgs,
): Promise<void> {
  const record = store.get(id);
  if (!record) return;

  record.status = "running";
  record.startedAt = Date.now();
  emitter.emit("change", id);

  try {
    const value = await impl(...args);
    record.result = value;
    record.status = "completed";
    record.completedAt = Date.now();
    log.debug(`task-queue: completed id=${id} label=${label}`);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    record.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    record.status = "failed";
    record.completedAt = Date.now();
    log.warn(`task-queue: failed id=${id} label=${label}: ${error.message}`);
  }
  emitter.emit("change", id);
}

export async function submit<TArgs extends unknown[], TValue>(
  label: string,
  impl: (...args: TArgs) => Promise<TValue>,
  args: TArgs,
): Promise<{ taskId: string }> {
  if (!label) throw new Error("task-queue: label is required");

  const id = crypto.randomUUID();
  const record: TaskRecord = {
    id,
    label,
    // structuredClone is the safe way to snapshot the args; some callers pass
    // objects that the impl may mutate, and we don't want that to leak into
    // the record's view of the submission.
    args: structuredClone(args),
    status: "pending",
    createdAt: Date.now(),
  };
  store.set(id, record);
  emitter.emit("change", id);
  evictIfOverCap();

  // Fire and forget. We intentionally do NOT await the browser queue — the
  // HTTP caller is unblocked the moment the PQueue accepts the job. Errors
  // from `runTask` are caught inside it; errors from the queue layer itself
  // are best-effort logged here and turned into a `failed` record.
  void enqueueBrowserOperation(
    () => runTask(id, label, impl, args),
    label,
  ).catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    log.warn(
      `task-queue: enqueue failed id=${id} label=${label}: ${message}`,
    );
    const r = store.get(id);
    if (r && (r.status === "running" || r.status === "pending")) {
      r.status = "failed";
      r.error = { name: "EnqueueError", message };
      r.completedAt = Date.now();
      emitter.emit("change", id);
    }
  });

  return { taskId: id };
}

export function getTask<TArgs = unknown, TValue = unknown>(
  id: string,
): TaskRecord<TArgs, TValue> | undefined {
  return store.get(id) as TaskRecord<TArgs, TValue> | undefined;
}

export function listTasks(filter?: TaskListFilter): TaskRecord[] {
  const all = [...store.values()];
  const filtered = filter
    ? all.filter((r) =>
      (filter.status === undefined || r.status === filter.status) &&
      (filter.label === undefined || r.label === filter.label)
    )
    : all;
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

export function markAllRunningAsFailed(reason: string): void {
  const now = Date.now();
  let count = 0;
  for (const record of store.values()) {
    if (record.status === "running" || record.status === "pending") {
      record.status = "failed";
      record.error = { name: "TaskQueueError", message: reason };
      record.completedAt = now;
      emitter.emit("change", record.id);
      count++;
    }
  }
  log.debug(
    `task-queue: marked ${count} running/pending task(s) as failed (reason: ${reason})`,
  );
}

export function onChange(handler: (id: string) => void): () => void {
  emitter.on("change", handler);
  return () => emitter.off("change", handler);
}
