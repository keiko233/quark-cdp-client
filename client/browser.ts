import type { Browser } from "npm:playwright";

let _browser: Browser | null = null;

export function setBrowser(browser: Browser | null): void {
  _browser = browser;
}

export function getBrowser(): Browser {
  if (!_browser) {
    throw new Error("Browser is not connected");
  }
  return _browser;
}
