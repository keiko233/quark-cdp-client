import type { Page } from "playwright";
import { getBrowser } from "../browser.ts";
import { QUARK_HOME_PAGE_URL } from "../../consts.ts";
import { findPageByUrl } from "../../libs/utils.ts";
import { normalizeFileListText } from "./get-file-list.ts";

export type QuarkDownloadTaskState = "running" | "complete";
export type QuarkDownloadStatusMode = QuarkDownloadTaskState | "all";

export interface QuarkDownloadTask {
  state: QuarkDownloadTaskState;
  name: string;
  size: string;
  progress: string;
  speed: string;
  remaining: string;
  completedAt: string;
}

export interface QuarkDownloadStatus {
  tasks: QuarkDownloadTask[];
}

const DOWNLOAD_TEXT = "\u4e0b\u8f7d";
const USER_DIVIDER_SELECTOR = "div.user-divider";
const TRANSPORT_TASK_BOX_SELECTOR = "div.transport-task-box";
const TABS_NAV_SELECTOR = "div.ant-tabs-nav-list";
const TASK_LIST_SELECTOR = "div.task-list-container";
const TASK_ITEM_SELECTOR = "div.task-item";
const TASK_PANEL_READY_TIMEOUT = 3_000;

async function openTransportCenter(homePage: Page): Promise<void> {
  const userDivider = homePage.locator(USER_DIVIDER_SELECTOR).first();
  await userDivider.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  const clicked = await userDivider.evaluate((element) => {
    const transportItem = element.children.item(1)?.querySelector("div");

    transportItem?.click();
    return Boolean(transportItem);
  });

  if (!clicked) {
    throw new Error("Transport nav item not found");
  }

  await homePage.locator(TRANSPORT_TASK_BOX_SELECTOR).first().waitFor({
    state: "visible",
    timeout: 10_000,
  });
}

async function openDownloadTasks(homePage: Page): Promise<void> {
  const clicked = await homePage.locator(TRANSPORT_TASK_BOX_SELECTOR)
    .evaluateAll((boxes, downloadText) => {
      const taskBox = boxes.find((box) => {
        const title = box.querySelector("div.transport-task-title")
          ?.textContent ?? "";
        return title.replace(/\s+/g, " ").trim() === downloadText;
      });

      (taskBox as { click?: () => void } | undefined)?.click?.();
      return Boolean(taskBox);
    }, DOWNLOAD_TEXT);

  if (!clicked) {
    throw new Error("Download task box not found");
  }

  await homePage.locator(TABS_NAV_SELECTOR).first().waitFor({
    state: "visible",
    timeout: 10_000,
  });
}

async function selectDownloadTaskTab(
  homePage: Page,
  state: QuarkDownloadTaskState,
): Promise<void> {
  const tab = homePage.locator(
    `${TABS_NAV_SELECTOR} div.ant-tabs-tab[data-node-key="${state}"]`,
  ).first();

  await tab.waitFor({
    state: "attached",
    timeout: 10_000,
  });
  await tab.evaluate((element) => {
    (element as { click: () => void }).click();
  });

  await waitForTaskPanelSettled(homePage);
}

async function waitForTaskPanelSettled(homePage: Page): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < TASK_PANEL_READY_TIMEOUT) {
    if (await homePage.locator(TASK_LIST_SELECTOR).first().isVisible()) {
      await homePage.waitForTimeout(300);
      return;
    }

    await homePage.waitForTimeout(100);
  }
}

async function readCurrentTabTasks(
  homePage: Page,
  state: QuarkDownloadTaskState,
): Promise<QuarkDownloadTask[]> {
  return await homePage.locator(`${TASK_LIST_SELECTOR} ${TASK_ITEM_SELECTOR}`)
    .evaluateAll((items, taskState) => {
      const normalize = (value: string | null): string =>
        (value ?? "").replace(/\s+/g, " ").trim();
      const parseSize = (
        value: string,
      ): { size: string; progress: string } => {
        const match = value.match(/^(.*?)\s*\((.*?)\)$/);
        if (!match) {
          return {
            size: value,
            progress: "",
          };
        }

        return {
          size: match[1]?.trim() ?? "",
          progress: match[2]?.trim() ?? "",
        };
      };

      return items.map((item) => {
        const sizeInfo = parseSize(
          normalize(item.querySelector(".task-size")?.textContent ?? ""),
        );
        const status = item.querySelector(".task-status");

        return {
          state: taskState as "running" | "complete",
          name: normalize(item.querySelector(".task-name-text")?.textContent),
          size: sizeInfo.size,
          progress: sizeInfo.progress,
          speed: taskState === "running"
            ? normalize(status?.textContent ?? "")
            : "",
          remaining: taskState === "running"
            ? normalize(item.querySelector(".time-remaining")?.textContent)
            : "",
          completedAt: taskState === "complete"
            ? normalize(status?.getAttribute("title") ?? status?.textContent)
            : "",
        };
      }).filter((task) => task.name.length > 0);
    }, state);
}

async function readDownloadTasks(
  homePage: Page,
  state: QuarkDownloadTaskState,
): Promise<QuarkDownloadTask[]> {
  await selectDownloadTaskTab(homePage, state);

  const taskList = homePage.locator(TASK_LIST_SELECTOR).first();
  if (!await taskList.isVisible()) {
    return [];
  }

  const tasks = new Map<string, QuarkDownloadTask>();

  await taskList.evaluate((element) => {
    element.scrollTop = 0;
  });

  let stableRounds = 0;
  let lastScrollTop = -1;

  while (stableRounds < 2) {
    const visibleTasks = await readCurrentTabTasks(homePage, state);
    const previousSize = tasks.size;

    for (const task of visibleTasks) {
      tasks.set(getDownloadTaskKey(task), task);
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

    if (
      tasks.size === previousSize && scrollState.scrollTop === lastScrollTop
    ) {
      stableRounds++;
    } else {
      stableRounds = scrollState.atBottom ? stableRounds + 1 : 0;
    }

    lastScrollTop = scrollState.scrollTop;
    await homePage.waitForTimeout(150);
  }

  return [...tasks.values()];
}

function getDownloadTaskKey(task: QuarkDownloadTask): string {
  return [
    task.state,
    task.name,
    task.size,
    task.completedAt,
  ].join("\u0000");
}

export async function getDownloadStatus(
  mode: QuarkDownloadStatusMode = "running",
): Promise<QuarkDownloadStatus> {
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

  const normalizedMode = normalizeFileListText(mode) as QuarkDownloadStatusMode;
  const states: QuarkDownloadTaskState[] = normalizedMode === "all"
    ? ["running", "complete"]
    : [normalizedMode === "complete" ? "complete" : "running"];

  const tasks = [];
  for (const state of states) {
    tasks.push(...await readDownloadTasks(homePage, state));
  }

  return {
    tasks,
  };
}
