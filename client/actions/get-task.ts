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
    description: [
      "Look up a single task in OUR async task queue by its UUID. Use this",
      "to poll the status of a `submit_*` call.",
      "",
      "Returns the full task record: status (`pending` | `running` |",
      "`completed` | `failed` | `cancelled`), timestamps, original args,",
      "and either `result` (on completion) or `error` (on failure).",
      "",
      "404 / `task not found` if the id doesn't exist. Tasks live in process",
      "memory only — restarting the client loses them.",
      "",
      "Note: this is OUR task queue, not Quark's download queue. To watch",
      "real download bytes flow, use `get_download_status` instead.",
    ].join("\n"),
    mcp: {
      name: "get_task",
      input: z.object({
        id: z.string().uuid().describe(
          "UUID v4 task id returned by a `submit_*` action.",
        ),
      }),
    },
  },
);
