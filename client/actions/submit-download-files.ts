// ──────────────────────────────────────────────────────────────────────────────
// Same-parent batch download. All `paths` must share the same parent
// directory; if they don't we throw a clear error.
//
// Each file is submitted as its own task (per the design spec — "per-file
// task IDs"). The "single nav" savings come implicitly: the first task in
// FIFO order does the navigation, subsequent tasks hit the same browser page
// and benefit from the `isAtPath` short-circuit in `downloadFileImpl`.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import type {
  QuarkDownloadFilesRequest,
  QuarkDownloadFilesResult,
  QuarkDownloadFileResult,
} from "../../libs/schemas.ts";
import { log } from "../../libs/logger.ts";
import { createAsyncAction } from "./create-async-action.ts";
import { downloadFileImpl } from "./download-file.ts";
import { parsePathSegments } from "./get-file-list.ts";
import { submit } from "../task-queue.ts";

function commonParent(paths: string[]): string {
  if (paths.length === 0) throw new Error("paths must be non-empty");
  const parents = paths.map((p) => {
    const segments = parsePathSegments(p);
    if (segments.length === 0) {
      throw new Error(`path has no parent segment: "${p}"`);
    }
    return segments.slice(0, -1).join("/");
  });
  const first = parents[0];
  if (parents.some((p) => p !== first)) {
    throw new Error("all paths must share the same parent directory");
  }
  return first;
}

export const submitDownloadFiles = createAsyncAction<
  [QuarkDownloadFilesRequest],
  QuarkDownloadFilesResult
>(
  "downloadFile",
  async ({ paths }): Promise<QuarkDownloadFilesResult> => {
    log.debug(`submitDownloadFiles: ${paths.length} path(s)`);

    // Validate the same-parent invariant up front. The per-file submissions
    // are fire-and-track, so failing the whole batch here is the only chance
    // to surface a misformed request synchronously.
    commonParent(paths);

    const taskIds: string[] = [];
    for (const path of paths) {
      // We re-use the per-file `downloadFileImpl`. The first one does the
      // nav; subsequent ones benefit from the `isAtPath` short-circuit.
      const { taskId } = await submit<[string], QuarkDownloadFileResult>(
        "downloadFile",
        downloadFileImpl,
        [path],
      );
      taskIds.push(taskId);
    }

    log.debug(`submitDownloadFiles: submitted ${taskIds.length} task(s)`);
    return { taskIds };
  },
  {
    description:
      "Submit a batch of same-parent file downloads. Each file gets its own taskId; subsequent calls hit the same browser page and skip navigation.",
    mcp: {
      name: "submit_download_files",
      input: z.object({
        paths: z.array(z.string().min(1)).min(1).max(100)
          .describe(
            "File paths to download. All must share the same parent directory.",
          ),
      }),
    },
  },
);
