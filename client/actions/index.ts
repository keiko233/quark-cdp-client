export type {
  QuarkFileList,
  QuarkFileListItem,
  QuarkDownloadTask,
  QuarkDownloadStatus,
  QuarkDownloadTaskState,
  QuarkDownloadStatusMode,
  QuarkDownloadTaskOperation,
} from "../../libs/schemas.ts";

import { Result } from "better-result";
import { log } from "../../libs/logger.ts";
import { enqueueBrowserOperation } from "../browser.ts";
import { TtlCache } from "../cache.ts";
import type {
  QuarkDownloadStatus,
  QuarkDownloadStatusMode,
  QuarkDownloadTaskOperation,
  QuarkFileList,
} from "../../libs/schemas.ts";

import { getLoginQRCode as getLoginQRCodeImpl } from "./get-login-qrcode.ts";
import { getLoginStatus as getLoginStatusImpl } from "./get-login-status.ts";
import { getUserInfo as getUserInfoImpl } from "./get-user-info.ts";
import { getFileList as getFileListImpl } from "./get-file-list.ts";
import { downloadFile as downloadFileImpl } from "./download-file.ts";
import {
  getDownloadStatus as getDownloadStatusImpl,
} from "./get-download-status.ts";
import {
  setDownloadStatus as setDownloadStatusImpl,
} from "./set-download-status.ts";

export type { QuarkSetDownloadStatusResult } from "./set-download-status.ts";
export type { QuarkDownloadFileResult } from "./download-file.ts";

const loginStatusCache = new TtlCache<"s", { loggedIn: boolean }>(5_000);
const userInfoCache = new TtlCache<"s", { capacity: string }>(30_000);
const fileListCache = new TtlCache<string, QuarkFileList>(30_000);
const downloadStatusCache = new TtlCache<string, QuarkDownloadStatus>(5_000);

export async function getLoginQRCode(): Promise<Result<Uint8Array, Error>> {
  return enqueueBrowserOperation(getLoginQRCodeImpl, "getLoginQRCode")
    .then((v) => Result.ok(v))
    .catch((e: unknown) => {
      const error = e instanceof Error ? e : new Error(String(e));
      log.warn(`getLoginQRCode failed: ${error.message}`);
      return Result.err(error);
    });
}

export async function getLoginStatus(): Promise<
  Result<{ loggedIn: boolean }, Error>
> {
  const cached = loginStatusCache.get("s");
  if (cached) {
    log.debug("getLoginStatus: cache hit");
    return Result.ok(cached);
  }
  log.debug("getLoginStatus: cache miss, enqueueing");
  return enqueueBrowserOperation(getLoginStatusImpl, "getLoginStatus")
    .then((v) => {
      loginStatusCache.set("s", v);
      return Result.ok(v);
    })
    .catch((e: unknown) => {
      const error = e instanceof Error ? e : new Error(String(e));
      log.warn(`getLoginStatus failed: ${error.message}`);
      return Result.err(error);
    });
}

export async function getUserInfo(): Promise<
  Result<{ capacity: string }, Error>
> {
  const cached = userInfoCache.get("s");
  if (cached) {
    log.debug("getUserInfo: cache hit");
    return Result.ok(cached);
  }
  log.debug("getUserInfo: cache miss, enqueueing");
  return enqueueBrowserOperation(getUserInfoImpl, "getUserInfo")
    .then((v) => {
      userInfoCache.set("s", v);
      return Result.ok(v);
    })
    .catch((e: unknown) => {
      const error = e instanceof Error ? e : new Error(String(e));
      log.warn(`getUserInfo failed: ${error.message}`);
      return Result.err(error);
    });
}

export async function getFileList(
  path?: string,
): Promise<Result<QuarkFileList, Error>> {
  const key = path ?? "";
  const cached = fileListCache.get(key);
  if (cached) {
    log.debug(`getFileList: cache hit path="${key}"`);
    return Result.ok(cached);
  }
  log.debug(`getFileList: cache miss path="${key}", enqueueing`);
  return enqueueBrowserOperation(() => getFileListImpl(path), "getFileList")
    .then((v) => {
      fileListCache.set(key, v);
      return Result.ok(v);
    })
    .catch((e: unknown) => {
      const error = e instanceof Error ? e : new Error(String(e));
      log.warn(`getFileList failed: ${error.message}`);
      return Result.err(error);
    });
}

export async function downloadFile(
  path: string,
): Promise<Result<{ name: string }, Error>> {
  return enqueueBrowserOperation(() => downloadFileImpl(path), "downloadFile")
    .then((v) => Result.ok(v))
    .catch((e: unknown) => {
      const error = e instanceof Error ? e : new Error(String(e));
      log.warn(`downloadFile failed: ${error.message}`);
      return Result.err(error);
    });
}

export async function getDownloadStatus(
  status?: QuarkDownloadStatusMode,
): Promise<Result<QuarkDownloadStatus, Error>> {
  const key = status ?? "running";
  const cached = downloadStatusCache.get(key);
  if (cached) {
    log.debug(`getDownloadStatus: cache hit mode=${key}`);
    return Result.ok(cached);
  }
  log.debug(`getDownloadStatus: cache miss mode=${key}, enqueueing`);
  return enqueueBrowserOperation(
    () => getDownloadStatusImpl(status),
    "getDownloadStatus",
  )
    .then((v) => {
      downloadStatusCache.set(key, v);
      return Result.ok(v);
    })
    .catch((e: unknown) => {
      const error = e instanceof Error ? e : new Error(String(e));
      log.warn(`getDownloadStatus failed: ${error.message}`);
      return Result.err(error);
    });
}

export async function setDownloadStatus(
  taskName: string,
  operation: QuarkDownloadTaskOperation,
): Promise<Result<{ success: boolean }, Error>> {
  return enqueueBrowserOperation(
    () => setDownloadStatusImpl(taskName, operation),
    "setDownloadStatus",
  )
    .then((v) => Result.ok(v))
    .catch((e: unknown) => {
      const error = e instanceof Error ? e : new Error(String(e));
      log.warn(`setDownloadStatus failed: ${error.message}`);
      return Result.err(error);
    });
}
