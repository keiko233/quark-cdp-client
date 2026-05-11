import type { Page } from "playwright";
import type { QuarkDownloadTaskOperation } from "../../libs/schemas.ts";
import { log } from "../../libs/logger.ts";
import { getHomePage, hoverAndClick } from "../page-utils.ts";
import {
  openDownloadTasks,
  openTransportCenter,
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
    const items = homePage.locator(`${TASK_LIST_SELECTOR} ${TASK_ITEM_SELECTOR}`);
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

export async function setDownloadStatus(
  taskName: string,
  operation: QuarkDownloadTaskOperation,
): Promise<QuarkSetDownloadStatusResult> {
  log.debug(`setDownloadStatus: task="${taskName}" op=${operation}`);

  const homePage = getHomePage();
  await homePage.bringToFront();
  await homePage.waitForLoadState("domcontentloaded");
  await openTransportCenter(homePage);
  await openDownloadTasks(homePage);
  await selectDownloadTaskTab(homePage, "running");

  const success = await findAndOperateTask(homePage, taskName, operation);

  if (!success) {
    log.warn(`setDownloadStatus: task not found "${taskName}"`);
  }

  return { success };
}
