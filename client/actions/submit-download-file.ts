// ──────────────────────────────────────────────────────────────────────────────
// Async-mode wrapper around `downloadFileImpl`. Returns a `taskId` immediately
// and runs the actual click work behind the task queue. The HTTP/MCP caller
// can poll the task via `getTask(id)` and watch for `status: "completed"`.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { createAsyncAction } from "./create-async-action.ts";
import { downloadFileImpl } from "./download-file.ts";
import type { QuarkDownloadFileResult } from "../../libs/schemas.ts";

export const submitDownloadFile = createAsyncAction<
  [string],
  QuarkDownloadFileResult
>(
  "downloadFile",
  downloadFileImpl,
  {
    description: [
      "Trigger a download — ASYNC submission. Returns a `taskId` immediately;",
      "the click work runs behind our browser-operation queue.",
      "",
      "Accepts both files and folders (Quark packages folder downloads into",
      "a single transport-center task).",
      "",
      "Lifecycle: the returned task starts `pending`, becomes `running` when",
      "it acquires the browser queue, then `completed` (with `{name,",
      "alreadyQueued?}` in `result`) or `failed` (with `error` populated).",
      "Poll `get_task(id)` until you see a terminal status, or use",
      "`list_tasks {label: \"downloadFile\"}` to watch many at once.",
      "",
      "Differs from `download_file` only in the response shape — the actual",
      "work is identical and the 5 s same-path dedup cache also applies.",
    ].join("\n"),
    mcp: {
      name: "submit_download_file",
      input: z.object({
        path: z.string().describe(
          "Full file or folder path in Quark drive, forward-slash separated.",
        ),
      }),
    },
  },
);
