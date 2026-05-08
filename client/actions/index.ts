export type {} from "./get-login-qrcode.ts";
export type {} from "./get-login-status.ts";
export type {} from "./get-user-info.ts";
export type {
	QuarkFileList,
	QuarkFileListItem,
} from "./get-file-list.ts";
export type { QuarkDownloadFileResult } from "./download-file.ts";
export type {
	QuarkDownloadStatus,
	QuarkDownloadStatusMode,
	QuarkDownloadTask,
	QuarkDownloadTaskState,
} from "./get-download-status.ts";

import { enqueueBrowserOperation } from "../browser.ts";
import { getLoginQRCode as getLoginQRCodeImpl } from "./get-login-qrcode.ts";
import { getLoginStatus as getLoginStatusImpl } from "./get-login-status.ts";
import { getUserInfo as getUserInfoImpl } from "./get-user-info.ts";
import { getFileList as getFileListImpl } from "./get-file-list.ts";
import { downloadFile as downloadFileImpl } from "./download-file.ts";
import {
	getDownloadStatus as getDownloadStatusImpl,
} from "./get-download-status.ts";

export function getLoginQRCode() {
	return enqueueBrowserOperation(getLoginQRCodeImpl, "getLoginQRCode");
}

export function getLoginStatus() {
	return enqueueBrowserOperation(getLoginStatusImpl, "getLoginStatus");
}

export function getUserInfo() {
	return enqueueBrowserOperation(getUserInfoImpl, "getUserInfo");
}

export function getFileList(path?: string) {
	return enqueueBrowserOperation(() => getFileListImpl(path), "getFileList");
}

export function downloadFile(path: string) {
	return enqueueBrowserOperation(() => downloadFileImpl(path), "downloadFile");
}

export function getDownloadStatus(status?: "running" | "complete" | "all") {
	return enqueueBrowserOperation(
		() => getDownloadStatusImpl(status),
		"getDownloadStatus",
	);
}
