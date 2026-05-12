import { QUARK_HOME_PAGE_URL, QUARK_LOGIN_PAGE_URL } from "../../consts.ts";
import { log } from "../../libs/logger.ts";
import { findPageByUrl } from "../../libs/utils.ts";
import { TtlCache } from "../cache.ts";
import { getBrowserContext } from "../page-utils.ts";
import { createAction } from "./create-action.ts";

const loginStatusCache = new TtlCache<"s", { loggedIn: boolean }>(5_000);

export const getLoginStatus = createAction(
  "getLoginStatus",
  async () => {
    log.debug("getLoginStatus: start");

    const context = getBrowserContext();
    const homePage = findPageByUrl(context, QUARK_HOME_PAGE_URL);

    if (!homePage) {
      const loginPage = findPageByUrl(context, QUARK_LOGIN_PAGE_URL);
      if (loginPage) {
        log.debug("getLoginStatus: login page found, not logged in");
        return { loggedIn: false };
      }
      throw new Error(
        `Login status page not found: ${QUARK_HOME_PAGE_URL} or ${QUARK_LOGIN_PAGE_URL}`,
      );
    }

    await homePage.bringToFront();
    await homePage.waitForLoadState("domcontentloaded");

    const memberContent = homePage.locator(".member-content-container").first();
    await memberContent.waitFor({ state: "visible", timeout: 10_000 });

    const loginButton = memberContent
      .locator("div.member-login")
      .filter({ hasText: "绔嬪嵆鐧诲綍" })
      .first();

    const loggedIn = await loginButton.count() === 0;
    log.debug(`getLoginStatus: loggedIn=${loggedIn}`);
    return { loggedIn };
  },
  {
    description: "Check whether the user is currently logged in to Quark",
    mcp: { name: "get_login_status" },
    cache: { cache: loginStatusCache, key: () => "s" },
  },
);
