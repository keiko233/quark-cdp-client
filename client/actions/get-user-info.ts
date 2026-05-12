import { log } from "../../libs/logger.ts";
import { TtlCache } from "../cache.ts";
import { getHomePage } from "../page-utils.ts";
import { createAction } from "./create-action.ts";

const userInfoCache = new TtlCache<"s", { capacity: string }>(30_000);

export const getUserInfo = createAction(
  "getUserInfo",
  async () => {
    log.debug("getUserInfo: start");

    const homePage = getHomePage();
    await homePage.bringToFront();
    await homePage.waitForLoadState("domcontentloaded");

    const capacityNumber = homePage.locator("div.capacity-number").first();
    await capacityNumber.waitFor({ state: "visible", timeout: 10_000 });

    const capacity = (await capacityNumber.textContent())?.trim() ?? "";
    log.debug(`getUserInfo: capacity="${capacity}"`);
    return { capacity };
  },
  {
    description: "Get user information including storage capacity",
    mcp: { name: "get_user_info" },
    cache: { cache: userInfoCache, key: () => "s" },
  },
);
