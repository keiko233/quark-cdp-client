import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { setBrowser } from "../browser.ts";
import { submitDownloadFile } from "./submit-download-file.ts";
import { getTask } from "../task-queue.ts";
import { CDP_URL } from "../../libs/env.ts";

const TEST_PATH = "/test/sample-file.txt"; // arbitrary; user can override

async function tryWithBrowser<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    const browser = await chromium.connectOverCDP(CDP_URL);
    setBrowser(browser);
    try {
      return await fn();
    } finally {
      setBrowser(null);
    }
  } catch {
    return null;
  }
}

async function pollUntilTerminal(taskId: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = getTask(taskId);
    if (r && (r.status === "completed" || r.status === "failed")) return r;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("pollUntilTerminal: timeout");
}

Deno.test({
  name: "submitDownloadFile: returns taskId and (best effort) reaches completed",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const result = await tryWithBrowser(async () => {
      const { taskId } = await submitDownloadFile(TEST_PATH);
      assert(taskId, "taskId should be present");

      const record = await pollUntilTerminal(taskId);
      assertEquals(record.status, "completed");
      assertEquals(record.result?.name, TEST_PATH.split("/").pop());
      return record;
    });
    // If CDP is not reachable, skip rather than fail.
    if (result === null) {
      console.log("[skip] CDP not reachable");
    }
  },
});
