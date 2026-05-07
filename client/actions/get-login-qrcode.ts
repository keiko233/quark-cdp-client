import type { BrowserContext, Page } from "playwright";
import { getBrowser } from "../browser.ts";
import { QUARK_HOME_PAGE_URL, QUARK_MEMBER_PAGE_URL } from "../../consts.ts";
import { findPageByUrl } from "../../libs/utils.ts";

async function getMemberPage(context: BrowserContext, homePage: Page): Promise<{
  memberPage: Page;
  createdByClick: boolean;
}> {
  const existingPage = findPageByUrl(context, QUARK_MEMBER_PAGE_URL);
  if (existingPage) {
    return {
      memberPage: existingPage,
      createdByClick: false,
    };
  }

  const loginButton = homePage
    .locator("div.member-login")
    .filter({ hasText: "立即登录" })
    .first();

  await loginButton.waitFor({ state: "visible" });

  const pagePromise = context.waitForEvent("page", { timeout: 10_000 });
  await loginButton.click();

  const memberPage = await pagePromise;
  await memberPage.waitForLoadState("domcontentloaded");

  return {
    memberPage,
    createdByClick: true,
  };
}

export async function getLoginQRCode() {
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

  const { memberPage } = await getMemberPage(context, homePage);

  await memberPage.bringToFront();
  await memberPage.reload({
    waitUntil: "domcontentloaded",
    timeout: 10_000,
  });
  await memberPage.waitForLoadState("networkidle", {
    timeout: 10_000,
  });

  const qrCode = memberPage.locator(".qrcode-container").first();
  await qrCode.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  return await qrCode.screenshot({
    type: "png",
  });
}
