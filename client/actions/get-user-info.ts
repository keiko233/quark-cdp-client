import { getBrowser } from "../browser.ts";
import { QUARK_HOME_PAGE_URL } from "../../consts.ts";
import { findPageByUrl } from "../../libs/utils.ts";

export async function getUserInfo() {
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

  const capacityNumber = homePage.locator("div.capacity-number").first();
  await capacityNumber.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  const capacity = await capacityNumber.textContent();

  return {
    capacity: capacity?.trim() ?? "",
  };
}
