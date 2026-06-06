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
    description: [
      "Submit a BATCH of downloads (files and/or folders) sharing the same",
      "parent directory. Async — returns `{taskIds: string[]}` immediately,",
      "one id per path in the same order as the request.",
      "",
      "Same-parent constraint: every path's directory must match. Mixed-",
      "parent batches are REJECTED synchronously (the call itself throws)",
      "rather than partially submitting — easier to handle as the caller.",
      "Max 100 paths per batch. Folders are accepted alongside files.",
      "",
      "Why batch: each download requires navigating to the item's folder.",
      "The first task in the batch does the nav; subsequent tasks land on",
      "the same folder and skip the nav step (see `isAtPath` short-circuit",
      "in download-file.ts). For 10 same-folder items this is roughly the",
      "difference between 10 navigations and 1.",
      "",
      "Track results with `get_task(id)` per id, or `list_tasks {label:",
      "\"downloadFile\"}` for the whole fleet.",
    ].join("\n"),
    mcp: {
      name: "submit_download_files",
      input: z.object({
        paths: z.array(z.string().min(1)).min(1).max(100)
          .describe(
            "1–100 file or folder paths to download. All MUST share the " +
              "same parent directory (e.g. `Movies/2024/a.mp4` and " +
              "`Movies/2024/2025-set` are fine; `Movies/2024/a.mp4` and " +
              "`Docs/b.pdf` are not).",
          ),
      }),
    },
  },
);
