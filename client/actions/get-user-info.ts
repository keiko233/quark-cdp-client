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

  const memberInfo = homePage.locator("div.member-info").first();
  await memberInfo.waitFor({
    state: "visible",
    timeout: 10_000,
  });
  await memberInfo.hover();

  const userInfoRoot = homePage.locator("body > div:nth-child(4) > div > div")
    .first();
  await userInfoRoot.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  const userName = userInfoRoot.locator(".user-name").first();
  await userName.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  const capacityUsed = userInfoRoot.locator(
    '[class^="SpaceManageEntry__capacity-used"]',
  ).first();
  const capacityTotal = userInfoRoot.locator(
    '[class^="SpaceManageEntry__capacity-total"]',
  ).first();

  await capacityUsed.waitFor({
    state: "visible",
    timeout: 10_000,
  });
  await capacityTotal.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  const [name, used, total] = await Promise.all([
    userName.textContent(),
    capacityUsed.textContent(),
    capacityTotal.textContent(),
  ]);

  return {
    name: name?.trim() ?? "",
    capacity: {
      used: used?.trim() ?? "",
      total: total?.trim() ?? "",
    },
  };
}
