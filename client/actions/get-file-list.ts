import type { Page } from "playwright";
import { getBrowser } from "../browser.ts";
import { QUARK_HOME_PAGE_URL } from "../../consts.ts";
import { findPageByUrl } from "../../libs/utils.ts";

export interface QuarkFileListItem {
  name: string;
  size: string;
  type: string;
  updatedAt: string;
}

export interface QuarkFileList {
  path: string[];
  items: QuarkFileListItem[];
}

export const TABLE_ROOT_SELECTOR =
  ".selecto-container.quark-cloud-drive-table-file";
export const BREADCRUMB_SELECTOR = "#quark-cloud-drive-list-all-breadcrumb";
export const TABLE_ROW_SELECTOR = "tbody.ant-table-tbody > tr";
export const TABLE_SCROLL_SELECTOR = "div.ant-table-body";
const HOME_TEXT = "\u9996\u9875";
const ROOT_PATH_TEXT = "\u6587\u4ef6";
const FILE_LIST_READY_TIMEOUT = 10_000;

export async function resetToHome(homePage: Page): Promise<void> {
  const userDivider = homePage.locator("div.user-divider").first();
  await userDivider.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  const clicked = await userDivider.evaluate((element) => {
    const homeItem = element.children.item(0)?.querySelector("div");

    homeItem?.click();
    return Boolean(homeItem);
  });

  if (!clicked) {
    throw new Error("Home nav item not found");
  }

  await waitForRootBreadcrumb(homePage);
  await waitForFileListReady(homePage);
}

async function waitForRootBreadcrumb(homePage: Page): Promise<void> {
  await homePage.locator(BREADCRUMB_SELECTOR).first().waitFor({
    state: "visible",
    timeout: 10_000,
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const pathSegments = await readBreadcrumbPath(homePage);
    if (pathSegments.length === 0) {
      return;
    }

    await homePage.waitForTimeout(100);
  }

  throw new Error("Timed out waiting for home breadcrumb");
}

async function collectVirtualTableRows(
  homePage: Page,
): Promise<QuarkFileListItem[]> {
  const scrollContainer = getScrollContainer(homePage);
  const rows = new Map<string, QuarkFileListItem>();

  await scrollContainer.evaluate((element) => {
    element.scrollTop = 0;
  });

  let stableRounds = 0;
  let lastScrollTop = -1;

  while (stableRounds < 2) {
    const visibleRows = await readVisibleRows(homePage);
    const previousSize = rows.size;

    for (const item of visibleRows) {
      rows.set(
        getFileListItemKey(item),
        item,
      );
    }

    const scrollState = await scrollContainer.evaluate((element) => {
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

    if (rows.size === previousSize && scrollState.scrollTop === lastScrollTop) {
      stableRounds++;
    } else {
      stableRounds = scrollState.atBottom ? stableRounds + 1 : 0;
    }

    lastScrollTop = scrollState.scrollTop;
    await homePage.waitForTimeout(150);
  }

  return [...rows.values()];
}

export async function navigateToPath(
  homePage: Page,
  path: string,
): Promise<void> {
  const segments = parsePathSegments(path);

  for (const segment of segments) {
    await openPathSegment(homePage, segment);
    await waitForFileListReady(homePage);
  }
}

async function openPathSegment(homePage: Page, segment: string): Promise<void> {
  const scrollContainer = getScrollContainer(homePage);
  const MAX_RETRIES = 20;
  const RETRY_DELAY_MS = 500;

  await scrollContainer.evaluate((element) => {
    element.scrollTop = 0;
  });
  await waitForFileListReady(homePage);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await scrollContainer.evaluate((element) => {
      element.scrollTop = 0;
    });

    while (true) {
      const visibleRowIndex = await findVisibleRowIndex(homePage, segment);
      if (visibleRowIndex >= 0) {
        await homePage.locator(TABLE_ROW_SELECTOR)
          .nth(visibleRowIndex)
          .evaluate((row) => {
            const MouseEventCtor = (window as unknown as {
              MouseEvent: new (
                type: string,
                eventInitDict?: {
                  bubbles?: boolean;
                  cancelable?: boolean;
                  view?: unknown;
                },
              ) => Event;
            }).MouseEvent;

            row.dispatchEvent(
              new MouseEventCtor("dblclick", {
                bubbles: true,
                cancelable: true,
                view: window,
              }),
            );
          });

        await homePage.locator(BREADCRUMB_SELECTOR).filter({ hasText: segment })
          .first()
          .waitFor({
            state: "visible",
            timeout: 10_000,
          });
        return;
      }

      const scrollState = await scrollContainer.evaluate((element) => {
        const before = element.scrollTop;
        element.scrollTop = Math.min(
          element.scrollTop + element.clientHeight,
          element.scrollHeight,
        );

        return {
          before,
          after: element.scrollTop,
        };
      });

      if (scrollState.after === scrollState.before) {
        break;
      }

      await homePage.waitForTimeout(150);
    }

    await homePage.waitForTimeout(RETRY_DELAY_MS);
  }

  throw new Error(`Path segment not found: ${segment}`);
}

export async function findVisibleRowIndex(
  homePage: Page,
  segment: string,
): Promise<number> {
  return await homePage.locator(TABLE_ROW_SELECTOR)
    .evaluateAll((rows, targetName) =>
      rows.findIndex((row) => {
        const name = row.querySelector("td.td-file.file-name .filename-text")
          ?.textContent ?? "";
        return name.replace(/\s+/g, " ").trim() === targetName;
      }), segment);
}

export async function waitForFileListReady(homePage: Page): Promise<void> {
  await homePage.locator(BREADCRUMB_SELECTOR).first().waitFor({
    state: "visible",
    timeout: 10_000,
  });
  await homePage.locator("tbody.ant-table-tbody")
    .first()
    .waitFor({
      state: "visible",
      timeout: 10_000,
    });
  await getScrollContainer(homePage).waitFor({
    state: "visible",
    timeout: 10_000,
  });
  await waitForNetworkSettled(homePage);
  await waitForTableRowsStable(homePage);
}

export function getScrollContainer(homePage: Page) {
  return homePage.locator(TABLE_SCROLL_SELECTOR).first();
}

async function waitForNetworkSettled(homePage: Page): Promise<void> {
  await homePage.waitForLoadState("networkidle", { timeout: 3_000 })
    .catch(() => undefined);
}

async function waitForTableRowsStable(homePage: Page): Promise<void> {
  let previousSnapshot = "";
  let stableRounds = 0;
  const startedAt = Date.now();

  while (Date.now() - startedAt < FILE_LIST_READY_TIMEOUT) {
    const snapshot = await homePage.locator(TABLE_ROW_SELECTOR).evaluateAll(
      (rows) =>
        rows
          .map((row) =>
            (row.querySelector("td.td-file.file-name .filename-text")
              ?.textContent ?? "").replace(/\s+/g, " ").trim()
          )
          .filter(Boolean)
          .join("\u0000"),
    );

    if (snapshot === previousSnapshot) {
      stableRounds++;
      if (stableRounds >= 2) {
        return;
      }
    } else {
      stableRounds = 0;
      previousSnapshot = snapshot;
    }

    await homePage.waitForTimeout(150);
  }
}

async function readVisibleRows(
  homePage: Page,
): Promise<QuarkFileListItem[]> {
  return await homePage.locator(TABLE_ROW_SELECTOR)
    .evaluateAll((rows) =>
      rows.map((row) => {
        const getCellText = (selector: string): string => {
          const cell = row.querySelector(selector);
          return (cell?.textContent ?? "").replace(/\s+/g, " ").trim();
        };

        return {
          name: getCellText(
            "td.ant-table-cell.td-file.file-name .filename-text",
          ),
          size: getCellText("td.ant-table-cell.td-file.td-file-size"),
          type: getCellText(
            "td.ant-table-cell.td-file:not(.file-name):not(.td-file-size):not(.td-file-time)",
          ),
          updatedAt: getCellText("td.ant-table-cell.td-file.td-file-time"),
        };
      }).filter((item) => item.name.length > 0)
    );
}

async function readBreadcrumbPath(homePage: Page): Promise<string[]> {
  return await homePage.locator(BREADCRUMB_SELECTOR).first().evaluate((
    root,
    rootPathText,
  ) => {
    const normalize = (value: string | null): string =>
      (value ?? "").replace(/\s+/g, " ").trim();

    return [...root.querySelectorAll(".bcrumb-filename")]
      .map((item) => normalize((item.querySelector("a") ?? item).textContent))
      .filter(Boolean)
      .filter((text) => text !== rootPathText);
  }, ROOT_PATH_TEXT);
}

export function normalizeFileListText(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function getFileListItemKey(item: QuarkFileListItem): string {
  return [
    item.name,
    item.size,
    item.type,
    item.updatedAt,
  ].join("\u0000");
}

export function parsePathSegments(path: string): string[] {
  return path
    .split(/[\\/]/)
    .map((segment) => normalizeFileListText(segment))
    .filter(Boolean)
    .filter((segment) => segment !== HOME_TEXT);
}

export async function getFileList(path?: string): Promise<QuarkFileList> {
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

  await resetToHome(homePage);

  if (path) {
    await navigateToPath(homePage, path);
  }

  await waitForFileListReady(homePage);

  const [pathSegments, items] = await Promise.all([
    readBreadcrumbPath(homePage),
    collectVirtualTableRows(homePage),
  ]);

  return {
    path: pathSegments,
    items,
  };
}
