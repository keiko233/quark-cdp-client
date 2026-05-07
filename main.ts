import { log } from "./libs/logger.ts";
import { CDP_URL, RECONNECT_INTERVAL_MS } from "./libs/env.ts";
import { startServer } from "./server/index.ts";
import { connect } from "./client/connect.ts";

log.debug("Quark Remote Client started");
log.debug(`CDP URL: ${CDP_URL}`);

startServer();

while (true) {
  try {
    await connect();
  } catch (err) {
    log.error("ERROR:", err);
  }
  log.debug(`Reconnecting in ${RECONNECT_INTERVAL_MS}ms...`);
  await new Promise((r) => setTimeout(r, RECONNECT_INTERVAL_MS));
}
