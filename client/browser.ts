import type { Browser } from "npm:playwright";
import { log } from "../libs/logger.ts";

let _browser: Browser | null = null;
let browserOperationQueue = Promise.resolve();
let queuedBrowserOperationCount = 0;
let activeBrowserOperationLabel: string | null = null;

export interface BrowserQueueStatus {
  running: boolean;
  current: string | null;
  queued: number;
  total: number;
}

export function setBrowser(browser: Browser | null): void {
  _browser = browser;
}

export function getBrowser(): Browser {
  if (!_browser) {
    throw new Error("Browser is not connected");
  }
  return _browser;
}

export function getBrowserQueueStatus(): BrowserQueueStatus {
  const running = activeBrowserOperationLabel !== null;

  return {
    running,
    current: activeBrowserOperationLabel,
    queued: queuedBrowserOperationCount,
    total: queuedBrowserOperationCount + (running ? 1 : 0),
  };
}

export async function enqueueBrowserOperation<T>(
  operation: () => Promise<T>,
  label = "anonymous",
): Promise<T> {
  queuedBrowserOperationCount++;

  const runOperation = browserOperationQueue.then(async () => {
    queuedBrowserOperationCount--;
    activeBrowserOperationLabel = label;
    log.trace(`browser queue start: ${label}`);

    try {
      return await operation();
    } finally {
      activeBrowserOperationLabel = null;
      log.trace(`browser queue end: ${label}`);
    }
  });

  browserOperationQueue = runOperation.then(
    () => undefined,
    () => undefined,
  );

  return await runOperation;
}
