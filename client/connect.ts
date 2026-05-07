import { chromium } from "npm:playwright";
import { log } from "../libs/logger.ts";
import { CDP_URL } from "../libs/env.ts";
import { setBrowser } from "./browser.ts";

export async function connect(): Promise<void> {
  log.debug(`connecting to CDP at ${CDP_URL}...`);

  const browser = await chromium.connectOverCDP(CDP_URL);
  log.debug(`connected to CDP, browser version: ${browser.version()}`);
  setBrowser(browser);

  browser.on("disconnected", () => {
    setBrowser(null);
    log.debug("CDP connection disconnected, will reconnect...");
  });

  const context = browser.contexts()[0];
  if (!context) {
    log.warn("No BrowserContext found, make sure QuarkCloudDrive is running");
    await browser.close();
    return;
  }

  const pages = context.pages();

  if (pages.length === 0) {
    log.warn(`No pages found, current pages:`);
    for (const p of pages) {
      log.warn(`  [${await p.title()}] ${p.url()}`);
    }
    await browser.close();
    return;
  }

  // get DevTools URLs if needed
  // deno-lint-ignore prefer-const
  let devtoolsUrls: Map<string, string> = new Map();

  try {
    const cdpBase = CDP_URL.replace(/\/$/, "");
    const list: Array<{ url: string; devtoolsFrontendUrl: string }> =
      await fetch(`${cdpBase}/json/list`).then((r) => r.json());
    for (const t of list) {
      devtoolsUrls.set(t.url, t.devtoolsFrontendUrl);
    }
  } catch (e) {
    log.warn("Failed to fetch DevTools URLs, DevTools will not be opened", e);
  }

  for (const page of pages) {
    const title = await page.title();
    log.debug(`attached to page: [${title}] ${page.url()}`);

    const frontendUrl = devtoolsUrls.get(page.url());
    if (frontendUrl) {
      const fullUrl = `${
        CDP_URL.replace(/\/$/, "").replace(/\/json.*$/, "")
      }${frontendUrl}`;
      log.debug(`DevTools URL: ${fullUrl}`);
    } else {
      log.warn(
        `No DevTools URL found for page ${page.url()}, skipping DevTools`,
      );
    }

    page.on("request", (req) => {
      log.trace("REQ", req.method(), req.url());
    });

    page.on("response", (res) => {
      log.trace("RES", res.status(), res.url());
    });

    page.on("close", () => log.debug(`page closed: [${title}] ${page.url()}`));
  }

  // wait until browser is disconnected
  await new Promise<void>((resolve) => {
    browser.on("disconnected", () => resolve());
  });
}
