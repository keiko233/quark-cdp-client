import type { Page } from "playwright";
import type {
  QuarkDownloadTask,
  QuarkDownloadTaskOperation,
  QuarkDownloadTaskState,
} from "../../libs/schemas.ts";
import { QuarkDownloadTaskOperationSchema } from "../../libs/schemas.ts";
import { z } from "zod";
import { log } from "../../libs/logger.ts";
import { getHomePage, hoverAndClick } from "../page-utils.ts";
import { createAction } from "./create-action.ts";
import {
  openDownloadTasks,
  openTransportCenter,
  readDownloadTasks,
  selectDownloadTaskTab,
  TASK_ITEM_SELECTOR,
  TASK_LIST_SELECTOR,
} from "./get-download-status.ts";

export type { QuarkDownloadTaskOperation };

export interface QuarkSetDownloadStatusResult {
  success: boolean;
}

const OPERATION_SELECTOR: Record<QuarkDownloadTaskOperation, string> = {
  resume: ".task-op-resume",
  pause: ".task-op-pause",
  delete: ".task-op-delete",
};

async function findAndOperateTask(
  homePage: Page,
  taskName: string,
  operation: QuarkDownloadTaskOperation,
): Promise<boolean> {
  const taskList = homePage.locator(TASK_LIST_SELECTOR).first();

  if (!await taskList.isVisible()) return false;

  await taskList.evaluate((el) => {
    el.scrollTop = 0;
  });

  let stableRounds = 0;
  let lastScrollTop = -1;

  while (stableRounds < 2) {
    const items = homePage.locator(
      `${TASK_LIST_SELECTOR} ${TASK_ITEM_SELECTOR}`,
    );
    const count = await items.count();

    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const rawName = await item.locator(".task-name-text").textContent();
      const normalizedName = (rawName ?? "").replace(/\s+/g, " ").trim();

      log.trace(`findAndOperateTask: checking item "${normalizedName}"`);

      if (normalizedName !== taskName) continue;

      const opButton = item.locator(OPERATION_SELECTOR[operation]).first();
      if (await opButton.isVisible().catch(() => false)) {
        await hoverAndClick(item, opButton);
        log.debug(`findAndOperateTask: operated task "${taskName}"`);
        return true;
      }

      return false;
    }

    const scrollState = await taskList.evaluate((element) => {
      const currentTop = element.scrollTop;
      element.scrollTop = Math.min(
        element.scrollTop + element.clientHeight,
        element.scrollHeight,
      );
      return {
        atBottom: element.scrollTop === currentTop ||
          element.scrollTop + element.clientHeight >= element.scrollHeight - 2,
        scrollTop: element.scrollTop,
      };
    });

    if (scrollState.scrollTop === lastScrollTop) {
      stableRounds++;
    } else {
      stableRounds = scrollState.atBottom ? stableRounds + 1 : 0;
    }

    lastScrollTop = scrollState.scrollTop;
    await homePage.waitForTimeout(150);
  }

  return false;
}

/**
 * Search both transport tabs in parallel for a task with the given name.
 * Returns the tab the task lives on, or `null` if it isn't found.
 *
 * Optimisation E — the previous implementation always selected the
 * `running` tab, which made it impossible to delete a completed task.
 * Now we discover the task first and only switch tabs when necessary.
 */
async function findTaskTab(
  homePage: Page,
  taskName: string,
): Promise<QuarkDownloadTaskState | null> {
  const states: QuarkDownloadTaskState[] = ["running", "complete"];
  const results = await Promise.all(
    states.map((state) => readDownloadTasks(homePage, state)),
  );
  for (let i = 0; i < states.length; i++) {
    const found = (results[i] as QuarkDownloadTask[]).find(
      (t) => t.name === taskName,
    );
    if (found) return states[i];
  }
  return null;
}

export const setDownloadStatus = createAction(
  "setDownloadStatus",
  async (
    taskName: string,
    operation: QuarkDownloadTaskOperation,
  ): Promise<QuarkSetDownloadStatusResult> => {
    log.debug(`setDownloadStatus: task="${taskName}" op=${operation}`);

    const homePage = getHomePage();
    await homePage.bringToFront();
    await homePage.waitForLoadState("domcontentloaded");
    await openTransportCenter(homePage);
    await openDownloadTasks(homePage);

    // Optimisation E — locate the task on either tab instead of always
    // switching to `running`. This makes `delete` on completed tasks work.
    const foundOn = await findTaskTab(homePage, taskName);
    if (foundOn === null) {
      log.warn(`setDownloadStatus: task not found "${taskName}"`);
      return { success: false };
    }

    log.debug(
      `setDownloadStatus: task "${taskName}" found on tab "${foundOn}"`,
    );
    await selectDownloadTaskTab(homePage, foundOn);

    const success = await findAndOperateTask(homePage, taskName, operation);

    if (!success) {
      log.warn(
        `setDownloadStatus: task "${taskName}" disappeared from "${foundOn}" tab after discovery`,
      );
    }

    return { success };
  },
  {
    description: [
      "Operate on a single row in Quark's transport center: `resume`,",
      "`pause`, or `delete`.",
      "",
      "Locate-then-act: we search BOTH `running` and `complete` tabs for a",
      "row whose name matches `taskName` exactly, then switch to whichever",
      "tab found it before clicking. This means `delete` works on already-",
      "completed tasks too (you don't have to remember which tab they're on).",
      "",
      "Returns `{success: boolean}`. `false` means either we couldn't find",
      "a row with that name on either tab, or the row disappeared between",
      "discovery and click (e.g. another client deleted it). Use",
      "`get_download_status` with `status: \"all\"` to get an authoritative",
      "list of `taskName` values.",
      "",
      "Note: `delete` removes the task from the transport center UI; it does",
      "NOT delete the already-downloaded file from disk.",
    ].join("\n"),
    mcp: {
      name: "set_download_status",
      input: z.object({
        taskName: z.string().describe(
          "Exact `name` of the transport-center row to operate on — get it " +
            "from `get_download_status`.",
        ),
        operation: QuarkDownloadTaskOperationSchema.describe(
          "`resume` / `pause` toggle a running task; `delete` removes the " +
            "row (file on disk is untouched).",
        ),
      }),
    },
  },
);
