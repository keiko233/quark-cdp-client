import type { BrowserContext, Locator, Page } from "playwright";
import { getBrowser } from "./browser.ts";
import { findPageByUrl } from "../libs/utils.ts";
import { QUARK_HOME_PAGE_URL } from "../consts.ts";
import { log } from "../libs/logger.ts";

export function getBrowserContext(): BrowserContext {
  const context = getBrowser().contexts()[0];
  if (!context) throw new Error("No BrowserContext found");
  return context;
}

export function getHomePage(): Page {
  const context = getBrowserContext();
  const page = findPageByUrl(context, QUARK_HOME_PAGE_URL);
  if (!page) throw new Error(`Home page not found: ${QUARK_HOME_PAGE_URL}`);
  log.trace(`getHomePage: found page url=${page.url()}`);
  return page;
}

export interface ScrollCollectOptions<T> {
  page: Page;
  scrollContainer: Locator;
  readVisible: () => Promise<T[]>;
  getKey: (item: T) => string;
  waitMs?: number;
  stableThreshold?: number;
  label?: string;
}

export async function scrollAndCollect<T>(
  opts: ScrollCollectOptions<T>,
): Promise<T[]> {
  const {
    page,
    scrollContainer,
    readVisible,
    getKey,
    waitMs = 150,
    stableThreshold = 2,
    label = "scrollAndCollect",
  } = opts;

  log.debug(`scrollAndCollect [${label}]: start`);

  await scrollContainer.evaluate((el) => {
    el.scrollTop = 0;
  });

  const seen = new Map<string, T>();
  let stableRounds = 0;
  let lastScrollTop = -1;
  let iter = 0;

  while (stableRounds < stableThreshold) {
    const visible = await readVisible();
    const prevSize = seen.size;
    for (const item of visible) seen.set(getKey(item), item);

    const scrollState = await scrollContainer.evaluate((el) => {
      const currentTop = el.scrollTop;
      el.scrollTop = Math.min(
        el.scrollTop + el.clientHeight,
        el.scrollHeight,
      );
      return {
        atBottom: el.scrollTop === currentTop ||
          el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
        scrollTop: el.scrollTop,
      };
    });

    log.trace(
      `scrollAndCollect [${label}]: iter=${iter} seen=${seen.size} scrollTop=${scrollState.scrollTop} stableRounds=${stableRounds}`,
    );

    if (seen.size === prevSize && scrollState.scrollTop === lastScrollTop) {
      stableRounds++;
    } else {
      stableRounds = scrollState.atBottom ? stableRounds + 1 : 0;
    }

    lastScrollTop = scrollState.scrollTop;
    iter++;
    await page.waitForTimeout(waitMs);
  }

  log.debug(
    `scrollAndCollect [${label}]: done, collected ${seen.size} items`,
  );
  return [...seen.values()];
}

export async function hoverAndClick(
  hoverTarget: Locator,
  clickTarget: Locator,
): Promise<void> {
  log.trace("hoverAndClick: hover + click");
  await hoverTarget.hover();
  await clickTarget.evaluate((el) => (el as { click: () => void }).click());
}
