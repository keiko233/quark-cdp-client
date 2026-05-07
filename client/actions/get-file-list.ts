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

const TABLE_ROOT_SELECTOR = ".selecto-container.quark-cloud-drive-table-file";
const BREADCRUMB_SELECTOR = "#quark-cloud-drive-list-all-breadcrumb";
const HOME_TEXT = "\u9996\u9875";
const ROOT_PATH_TEXT = "\u6587\u4ef6";

async function resetToHome(homePage: Page): Promise<void> {
  const navList = homePage.locator('[class^="SiderNav__nav-list"]').first();
  await navList.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  const clicked = await navList.evaluate((element, homeText) => {
    const items = [...element.querySelectorAll("[class]")];
    const homeItem = items.find((item) =>
      [...item.classList].some((className) =>
        className === `nav-item-${homeText}` ||
        className.includes(`nav-item-${homeText}`)
      ) || (item.textContent ?? "").includes(homeText)
    );

    homeItem?.click();
    return Boolean(homeItem);
  }, HOME_TEXT);

  if (!clicked) {
    throw new Error("Home nav item not found");
  }

  await homePage.locator(BREADCRUMB_SELECTOR).first().waitFor({
    state: "visible",
    timeout: 10_000,
  });
  await homePage.locator(TABLE_ROOT_SELECTOR).first()
    .locator("tbody.ant-table-tbody")
    .first()
    .waitFor({
      state: "visible",
      timeout: 10_000,
    });
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

async function navigateToPath(homePage: Page, path: string): Promise<void> {
  const segments = parsePathSegments(path);

  for (const segment of segments) {
    await openPathSegment(homePage, segment);
    await waitForFileListReady(homePage);
  }
}

async function openPathSegment(homePage: Page, segment: string): Promise<void> {
  const scrollContainer = getScrollContainer(homePage);

  await scrollContainer.evaluate((element) => {
    element.scrollTop = 0;
  });

  while (true) {
    const visibleRowIndex = await findVisibleRowIndex(homePage, segment);
    if (visibleRowIndex >= 0) {
      await homePage.locator(`${TABLE_ROOT_SELECTOR} tr.ant-table-row`)
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
      throw new Error(`Path segment not found: ${segment}`);
    }

    await homePage.waitForTimeout(150);
  }
}

async function findVisibleRowIndex(
  homePage: Page,
  segment: string,
): Promise<number> {
  return await homePage.locator(`${TABLE_ROOT_SELECTOR} tr.ant-table-row`)
    .evaluateAll((rows, targetName) =>
      rows.findIndex((row) => {
        const name = row.querySelector("td.td-file-name")?.textContent ?? "";
        return name.replace(/\s+/g, " ").trim() === targetName;
      }), segment);
}

async function waitForFileListReady(homePage: Page): Promise<void> {
  await homePage.locator(BREADCRUMB_SELECTOR).first().waitFor({
    state: "visible",
    timeout: 10_000,
  });
  await homePage.locator(TABLE_ROOT_SELECTOR).first()
    .locator("tbody.ant-table-tbody")
    .first()
    .waitFor({
      state: "visible",
      timeout: 10_000,
    });
}

function getScrollContainer(homePage: Page) {
  return homePage.locator(
    [
      `${TABLE_ROOT_SELECTOR} .ant-table-body.ant-table-body-scroll`,
      `${TABLE_ROOT_SELECTOR} .rc-virtual-list-holder`,
      `${TABLE_ROOT_SELECTOR} .ant-table-body`,
    ].join(", "),
  ).first();
}

async function readVisibleRows(
  homePage: Page,
): Promise<QuarkFileListItem[]> {
  return await homePage.locator(`${TABLE_ROOT_SELECTOR} tr.ant-table-row`)
    .evaluateAll((rows) =>
      rows.map((row) => {
        const getCellText = (selector: string): string => {
          const cell = row.querySelector(selector);
          return (cell?.textContent ?? "").replace(/\s+/g, " ").trim();
        };

        return {
          name: getCellText("td.td-file-name"),
          size: getCellText("td.td-file-size"),
          type: getCellText("td.td-file-type"),
          updatedAt: getCellText("td.td-file-time"),
        };
      }).filter((item) => item.name.length > 0)
    );
}

async function readBreadcrumbPath(homePage: Page): Promise<string[]> {
  return await homePage.locator(BREADCRUMB_SELECTOR).first().evaluate((
    root,
    rootPathText,
  ) =>
    [...root.querySelectorAll(".bcrumb-filename")]
      .map((item) => {
        const textElement = item.querySelector("span") ?? item;
        return (textElement.textContent ?? "").replace(/\s+/g, " ").trim();
      })
      .filter(Boolean)
      .filter((text) => text !== rootPathText), ROOT_PATH_TEXT);
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
