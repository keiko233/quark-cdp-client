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
    description:
      "List tasks, optionally filtered by status and/or label. Returns newest-first.",
    mcp: {
      name: "list_tasks",
      input: z.object({
        status: QuarkTaskStatusSchema
          .describe("Filter by task status")
          .optional(),
        label: z.string().describe("Filter by task label").optional(),
      }).optional(),
    },
  },
);
