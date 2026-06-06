// ──────────────────────────────────────────────────────────────────────────────
// List tasks, optionally filtered by status and/or label. Results are sorted
// newest-first (`createdAt` desc) by `taskQueue.listTasks`.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { QuarkTaskStatusSchema } from "../../libs/schemas.ts";
import { createAction } from "./create-action.ts";
import { listTasks, type TaskListFilter } from "../task-queue.ts";

export const listTasksAction = createAction(
  "listTasks",
  async (filter?: TaskListFilter) => {
    return { tasks: listTasks(filter) };
  },
  {
    description: [
      "List tasks in OUR async task queue, newest-first (`createdAt` desc).",
      "Optional filters narrow by status and/or label.",
      "",
      "Common queries:",
      "  - no filter: all tasks, all statuses, newest-first",
      "  - `{status: \"running\"}`: what's in flight right now",
      "  - `{label: \"downloadFile\"}`: every download submission",
      "  - `{status: \"failed\", label: \"downloadFile\"}`: failed downloads",
      "    to retry",
      "",
      "Returns `{tasks: QuarkTaskRecord[]}`. Each record includes timestamps,",
      "original args, and either `result` or `error`. The label is set by",
      "the underlying action (e.g. `downloadFile`).",
      "",
      "Note: this is OUR queue (`submit_*` lifecycle), not Quark's download",
      "queue — for the latter use `get_download_status`.",
    ].join("\n"),
    mcp: {
      name: "list_tasks",
      input: z.object({
        status: QuarkTaskStatusSchema
          .describe(
            "Keep only tasks in this status. Omit for all statuses.",
          )
          .optional(),
        label: z.string().describe(
          "Keep only tasks with exactly this label (e.g. `downloadFile`).",
        ).optional(),
      }).optional(),
    },
  },
);
