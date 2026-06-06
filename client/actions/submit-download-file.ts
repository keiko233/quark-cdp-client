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
    description:
      "Submit a file download to the background queue. Returns a taskId immediately; poll getTask(id) for completion.",
    mcp: {
      name: "submit_download_file",
      input: z.object({
        path: z.string().describe("File path in Quark drive"),
      }),
    },
  },
);
