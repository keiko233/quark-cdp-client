import { load } from "@std/dotenv";
import { levellike } from "@libs/logger";

const env = await load({ export: false });

export const CDP_URL = env["CDP_URL"] ?? "http://127.0.0.1:9222";
export const RECONNECT_INTERVAL_MS = Number(
  env["RECONNECT_INTERVAL_MS"] ?? "5000",
);
export const LOG_LEVEL = (env["LOG_LEVEL"] ?? "info") as levellike;
export const SERVER_PORT = Number(env["SERVER_PORT"] ?? "3000");
