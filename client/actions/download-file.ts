import type { Page } from "playwright";
import type { QuarkFileList, QuarkFileListItem } from "../../libs/schemas.ts";
import { log } from "../../libs/logger.ts";
import { getHomePage } from "../page-utils.ts";
import {
  findVisibleRowIndex,
  getScrollContainer,
  navigateToPath,
  normalizeFileListText,
  parsePathSegments,
  resetToHome,
  TABLE_ROW_SELECTOR,
  waitForFileListReady,
} from "./get-file-list.ts";

export type { QuarkFileList, QuarkFileListItem };

export interface QuarkDownloadFileResult {
  name: string;
}

const DOWNLOAD_BUTTON_INDEX = 0;

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

export async function downloadFile(
  path: string,
): Promise<QuarkDownloadFileResult> {
  log.debug(`downloadFile: path="${path}"`);

  const target = getTargetFromPath(path);
  const homePage = getHomePage();
  await homePage.bringToFront();
  await homePage.waitForLoadState("domcontentloaded");

  await resetToHome(homePage);
  if (target.parentPath) {
    await navigateToPath(homePage, target.parentPath);
  }
  await waitForFileListReady(homePage);

  const visibleRowIndex = await scrollFileIntoView(
    homePage,
    normalizeFileListText(target.fileName),
  );

  await clickDownloadButton(homePage, visibleRowIndex);

  log.debug(`downloadFile: queued "${target.fileName}"`);
  return { name: target.fileName };
}
