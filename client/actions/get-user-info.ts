import { log } from "../../libs/logger.ts";
import { getHomePage } from "../page-utils.ts";

export async function getUserInfo() {
  log.debug("getUserInfo: start");

  const homePage = getHomePage();
  await homePage.bringToFront();
  await homePage.waitForLoadState("domcontentloaded");

  const capacityNumber = homePage.locator("div.capacity-number").first();
  await capacityNumber.waitFor({ state: "visible", timeout: 10_000 });

  const capacity = (await capacityNumber.textContent())?.trim() ?? "";
  log.debug(`getUserInfo: capacity="${capacity}"`);
  return { capacity };
}
