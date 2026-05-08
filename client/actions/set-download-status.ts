import type { Page } from "playwright";
import { getBrowser } from "../browser.ts";
import { QUARK_HOME_PAGE_URL } from "../../consts.ts";
import { findPageByUrl } from "../../libs/utils.ts";
import {
  openTransportCenter,
  openDownloadTasks,
  selectDownloadTaskTab,
} from "./get-download-status.ts";

export type QuarkDownloadTaskOperation = "resume" | "pause" | "delete";

export interface QuarkSetDownloadStatusResult {
  success: boolean;
}

const TASK_LIST_SELECTOR = "div.task-list-container";
const TASK_ITEM_SELECTOR = "div.task-item";

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

  if (!await taskList.isVisible()) {
    return false;
  }

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

      if (normalizedName !== taskName) continue;

      await item.hover();

      const opButton = item.locator(OPERATION_SELECTOR[operation]).first();
      if (await opButton.isVisible()) {
        await opButton.evaluate((el) => (el as HTMLElement).click());
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
  const browser = getBrowser();

  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("No BrowserContext found");
  }

  const homePage = findPageByUrl(context, QUARK_HOME_PAGE_URL);
  if (!homePage) {
    throw new Error(`Home page not found: ${QUARK_HOME_PAGE_URL}`);
  }

  await homePage.bringToFront();
  await homePage.waitForLoadState("domcontentloaded");
  await openTransportCenter(homePage);
  await openDownloadTasks(homePage);
  await selectDownloadTaskTab(homePage, "running");

  const success = await findAndOperateTask(homePage, taskName, operation);

  return { success };
}
