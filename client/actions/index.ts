export type {
  QuarkDownloadFileResult,
  QuarkDownloadStatus,
  QuarkDownloadStatusMode,
  QuarkDownloadTask,
  QuarkDownloadTaskOperation,
  QuarkDownloadTaskState,
  QuarkFileList,
  QuarkFileListItem,
  QuarkSubmitResult,
  QuarkTaskRecord,
  QuarkTaskStatus,
} from "../../libs/schemas.ts";

export type { QuarkImportShareLinkResult } from "./import-share-link.ts";
export type { QuarkSetDownloadStatusResult } from "./set-download-status.ts";
export type { AsyncAction } from "./create-async-action.ts";

import { downloadFile } from "./download-file.ts";
import { getDownloadStatus } from "./get-download-status.ts";
import { getFileList } from "./get-file-list.ts";
import { getTaskAction } from "./get-task.ts";
import { importShareLink } from "./import-share-link.ts";
import { listTasksAction } from "./list-tasks.ts";
import { getLoginQRCode } from "./get-login-qrcode.ts";
import { getLoginStatus } from "./get-login-status.ts";
import { getUserInfo } from "./get-user-info.ts";
import { setDownloadStatus } from "./set-download-status.ts";
import { submitDownloadFile } from "./submit-download-file.ts";
import { submitDownloadFiles } from "./submit-download-files.ts";

export { downloadFile } from "./download-file.ts";
export { getDownloadStatus } from "./get-download-status.ts";
export { getFileList } from "./get-file-list.ts";
export { getTaskAction } from "./get-task.ts";
export { importShareLink } from "./import-share-link.ts";
export { listTasksAction } from "./list-tasks.ts";
export { getLoginQRCode } from "./get-login-qrcode.ts";
export { getLoginStatus } from "./get-login-status.ts";
export { getUserInfo } from "./get-user-info.ts";
export { setDownloadStatus } from "./set-download-status.ts";
export { submitDownloadFile } from "./submit-download-file.ts";
export { submitDownloadFiles } from "./submit-download-files.ts";

export const quarkActions = [
  getLoginQRCode,
  getLoginStatus,
  getUserInfo,
  getFileList,
  submitDownloadFile,
  submitDownloadFiles,
  downloadFile,
  getDownloadStatus,
  setDownloadStatus,
  getTaskAction,
  listTasksAction,
  importShareLink,
] as const;
