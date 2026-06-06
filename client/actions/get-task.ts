// ──────────────────────────────────────────────────────────────────────────────
// Look up a task by id. The HTTP layer maps the "task not found" case to a
// 404 via `ORPCError` (see `server/router.ts`).
// ──────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { createAction } from "./create-action.ts";
import { getTask } from "../task-queue.ts";

export const getTaskAction = createAction(
  "getTask",
  async (id: string) => {
    const record = getTask(id);
    if (!record) throw new Error(`task not found: ${id}`);
    return record;
  },
  {
    description: "Look up a single task by its id",
    mcp: {
      name: "get_task",
      input: z.object({
        id: z.string().uuid().describe("Task id returned from submit*"),
      }),
    },
  },
);
