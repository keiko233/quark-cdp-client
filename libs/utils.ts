import type { BrowserContext, Page } from "playwright";

export function findPageByUrl(
  context: BrowserContext,
  targetUrl: string,
): Page | undefined {
  return context.pages().find((page) => page.url().startsWith(targetUrl));
}
