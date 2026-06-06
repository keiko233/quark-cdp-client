import type { Page } from "playwright";
import { z } from "zod";
import type { QuarkDownloadFileResult } from "../../libs/schemas.ts";
import { log } from "../../libs/logger.ts";
import { getHomePage } from "../page-utils.ts";
import { TtlCache } from "../cache.ts";
import { createAction, unwrapResult } from "./create-action.ts";
import {
  findVisibleRowIndex,
  getScrollContainer,
  isAtPath,
  navigateToPath,
  normalizeFileListText,
  parsePathSegments,
  resetToHome,
  TABLE_ROW_SELECTOR,
  waitForFileListReady,
} from "./get-file-list.ts";
import { getDownloadStatus } from "./get-download-status.ts";
import { submitDownloadFile } from "./submit-download-file.ts";
import { getTask } from "../task-queue.ts";

export type { QuarkDownloadFileResult };

const DOWNLOAD_BUTTON_INDEX = 0;

/**
 * Short TTL on the sync `downloadFile` wrapper. Optimisation D — prevents
 * near-simultaneous triggers of the same path from kicking off redundant
 * work. The cache is set on success only (via `createAction`'s cache write),
 * so a failed click can be retried immediately.
 */
const downloadFileCache = new TtlCache<string, QuarkDownloadFileResult>(5_000);

/**
 * Polling parameters for the sync wrapper.
 */
const DOWNLOAD_POLL_INTERVAL_MS = 250;
const DOWNLOAD_POLL_TIMEOUT_MS = 60_000;

function getTargetFromPath(
  path: string,
): { parentPath: string; fileName: string } {
  const segments = parsePathSegments(path);
  const fileName = segments.at(-1);

  if (!fileName) throw new Error("Download file path is empty");

  return {
    parentPath: segments.slice(0, -1).join("/"),
    fileName,
  };
}

async function scrollFileIntoView(
  homePage: Page,
  fileName: string,
): Promise<number> {
  log.trace(`scrollFileIntoView: looking for "${fileName}"`);
  const scrollContainer = getScrollContainer(homePage);
  await scrollContainer.evaluate((element) => {
    element.scrollTop = 0;
  });

  while (true) {
    const visibleRowIndex = await findVisibleRowIndex(homePage, fileName);
    if (visibleRowIndex >= 0) {
      log.trace(`scrollFileIntoView: found at index ${visibleRowIndex}`);
      return visibleRowIndex;
    }

    const scrollState = await scrollContainer.evaluate((element) => {
      const before = element.scrollTop;
      element.scrollTop = Math.min(
        element.scrollTop + element.clientHeight,
        element.scrollHeight,
      );
      return { before, after: element.scrollTop };
    });

    if (scrollState.after === scrollState.before) {
      throw new Error(`File not found: ${fileName}`);
    }

    log.trace(
      `scrollFileIntoView: scrolling, looking for "${fileName}"`,
    );
    await homePage.waitForTimeout(150);
  }
}

async function clickDownloadButton(
  homePage: Page,
  visibleRowIndex: number,
): Promise<void> {
  log.trace(`clickDownloadButton: row index=${visibleRowIndex}`);
  const row = homePage.locator(TABLE_ROW_SELECTOR).nth(visibleRowIndex);
  const fileNameCell = row.locator("td.td-file.file-name").first();
  await fileNameCell.hover();
  await row.locator(".filename-text").first().hover().catch(() => undefined);

  const downloadButton = row
    .locator(".hover-oper > .hover-oper-list > .hover-oper-item")
    .nth(DOWNLOAD_BUTTON_INDEX);

  await downloadButton.waitFor({ state: "attached", timeout: 5_000 });
  await downloadButton.evaluate((element) => {
    (element as { click: () => void }).click();
  });
}

/**
 * The actual download work. Used by both the sync `downloadFile` wrapper and
 * the async `submitDownloadFile` action. Implements:
 *   B — skip `resetToHome` / `navigateToPath` when already at the target path
 *   C — dedup against the live download task list (`getDownloadStatus`) and
 *       return `{ name, alreadyQueued: true }` if the file is already in
 *       `running` or `complete`
 */
export async function downloadFileImpl(
  path: string,
): Promise<QuarkDownloadFileResult> {
  log.debug(`downloadFile: path="${path}"`);

  const target = getTargetFromPath(path);
  const targetSegments = parsePathSegments(target.parentPath);
  const homePage = getHomePage();
  await homePage.bringToFront();
  await homePage.waitForLoadState("domcontentloaded");

  // Optimisation B — skip navigation when already at the target path.
  if (target.parentPath) {
    const alreadyAt = await isAtPath(homePage, targetSegments);
    if (alreadyAt) {
      log.trace("downloadFile: already at target path, skipping navigation");
    } else {
      await resetToHome(homePage);
      await navigateToPath(homePage, target.parentPath);
    }
  } else {
    await resetToHome(homePage);
  }
  await waitForFileListReady(homePage);

  // Optimisation C — dedup against the live download task list. If the file
  // is already in the transport panel (running or complete), skip the click.
  const normalizedName = normalizeFileListText(target.fileName);
  const statusResult = await getDownloadStatus("all");
  const status = unwrapResult<{ tasks: { name: string }[] }>(statusResult);
  const existing = status.tasks.find((t) => t.name === normalizedName);
  if (existing) {
    log.debug(
      `downloadFile: "${target.fileName}" already in transport list, skipping click`,
    );
    return { name: target.fileName, alreadyQueued: true };
  }

  const visibleRowIndex = await scrollFileIntoView(homePage, normalizedName);

  await clickDownloadButton(homePage, visibleRowIndex);

  log.debug(`downloadFile: queued "${target.fileName}"`);
  return { name: target.fileName };
}

/**
 * Sync wrapper that delegates to `submitDownloadFile` (async) and polls the
 * task queue until the click is issued. Wire-compatible with the original
 * `GET /download-file` callers; the 5s `downloadFileCache` (optimisation D)
 * dedupes near-simultaneous triggers of the same path.
 */
export const downloadFile = createAction(
  "downloadFile",
  async (path: string): Promise<QuarkDownloadFileResult> => {
    const { taskId } = await submitDownloadFile(path);

    const startedAt = Date.now();
    while (Date.now() - startedAt < DOWNLOAD_POLL_TIMEOUT_MS) {
      const record = getTask(taskId);
      if (!record) throw new Error(`downloadFile: task ${taskId} vanished`);
      if (record.status === "completed") {
        return record.result as QuarkDownloadFileResult;
      }
      if (record.status === "failed") {
        const message = record.error?.message ?? "unknown error";
        throw new Error(`downloadFile: task failed: ${message}`);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, DOWNLOAD_POLL_INTERVAL_MS)
      );
    }

    throw new Error("downloadFile: task polling timeout");
  },
  {
    description: [
      "Trigger a download in the Quark client — SYNCHRONOUS wrapper.",
      "",
      "Works for BOTH files and folders. Quark itself handles the folder",
      "case by packaging the directory client-side; you'll see a single",
      "task in the transport center either way.",
      "",
      "This is the convenience entry point: it submits the same work as",
      "`submit_download_file` and then blocks until that submission has",
      "actually clicked the download button (the task reaches `completed`",
      "in OUR queue, NOT until the file is fully downloaded). Returns",
      "`{name, alreadyQueued?}` where `alreadyQueued: true` means the item",
      "was already in the transport center (running or complete) and we",
      "skipped the click.",
      "",
      "Prefer the async pair `submit_download_file` + `get_task` when:",
      "  - the path resolves slowly (deep navigation)",
      "  - you're batching multiple downloads",
      "  - the caller can't afford a multi-second sync response.",
      "",
      "Polls every 250 ms and times out after 60 s. The actual bytes flow",
      "inside Quark's own download queue — query `get_download_status` to",
      "watch real progress.",
      "",
      "Dedup: a 5 s sync cache suppresses redundant duplicate-path triggers.",
    ].join("\n"),
    mcp: {
      name: "download_file",
      input: z.object({
        path: z.string().describe(
          "Full path to the file OR folder in Quark drive, forward-slash " +
            "separated (e.g. `Movies/2024/movie.mp4` for a file, or " +
            "`Movies/2024` for a folder). Folder downloads are packaged " +
            "into a single transport-center task by Quark itself.",
        ),
      }),
    },
    cache: {
      cache: downloadFileCache,
      key: (path: string) => path,
      keyLabel: (key) => ` path="${key}"`,
    },
  },
);
