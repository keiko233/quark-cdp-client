import { getBrowser } from "../browser.ts";
import { QUARK_HOME_PAGE_URL } from "../../consts.ts";
import { findPageByUrl } from "../../libs/utils.ts";

export async function getLoginStatus() {
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

  const memberContent = homePage.locator(".member-content-container").first();
  await memberContent.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  const loginButton = memberContent
    .locator("div.member-login")
    .filter({ hasText: "立即登录" })
    .first();

  return {
    loggedIn: await loginButton.count() === 0,
  };
}
