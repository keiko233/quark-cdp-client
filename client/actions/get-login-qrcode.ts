import type { BrowserContext, Page } from "playwright";
import { getBrowser } from "../browser.ts";
import {
  QUARK_HOME_PAGE_URL,
  QUARK_LOGIN_PAGE_URL,
  QUARK_MEMBER_PAGE_URL,
} from "../../consts.ts";
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

  const existingLoginPage = findPageByUrl(context, QUARK_LOGIN_PAGE_URL);
  if (existingLoginPage) {
    return {
      memberPage: existingLoginPage,
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

async function screenshotQRCode(
  page: Page,
  options: { refresh?: boolean } = {},
): Promise<Uint8Array> {
  await page.bringToFront();
  if (options.refresh) {
    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: 10_000,
    });
    await page.waitForLoadState("networkidle", {
      timeout: 10_000,
    });
  } else {
    await page.waitForLoadState("domcontentloaded");
  }

  const qrCode = page.locator([
    ".qrcode-display canvas",
    ".qrcode-container canvas",
    ".qrcode-display",
    ".qrcode-container",
  ].join(", ")).first();
  await qrCode.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  return await qrCode.screenshot({
    type: "png",
  });
}

export async function getLoginQRCode() {
  const browser = getBrowser();

  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("No BrowserContext found");
  }

  const homePage = findPageByUrl(context, QUARK_HOME_PAGE_URL);
  if (!homePage) {
    const loginPage = findPageByUrl(context, QUARK_LOGIN_PAGE_URL);
    if (loginPage) {
      return await screenshotQRCode(loginPage, { refresh: true });
    }

    throw new Error(
      `Login QR code page not found: ${QUARK_HOME_PAGE_URL} or ${QUARK_LOGIN_PAGE_URL}`,
    );
  }

  await homePage.bringToFront();

  const { memberPage } = await getMemberPage(context, homePage);

  return await screenshotQRCode(memberPage, { refresh: true });
}
