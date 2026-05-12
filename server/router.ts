import { getBrowser, getBrowserQueueStatus } from "../client/browser.ts";
import {
  downloadFile,
  getDownloadStatus,
  getFileList,
  getLoginQRCode,
  getLoginStatus,
  getUserInfo,
  setDownloadStatus,
} from "../client/actions/index.ts";
import {
  BrowserQueueStatusSchema,
  QuarkDownloadStatusModeSchema,
  QuarkDownloadStatusSchema,
  QuarkDownloadTaskOperationSchema,
  QuarkFileListSchema,
} from "../libs/schemas.ts";
import z from "zod";
import { baseProcedure } from "./errors.ts";

// deno-lint-ignore no-explicit-any
function unwrap<T>(result: any): T {
  // better-result's match: ok branch returns value, err branch throws
  // deno-lint-ignore no-explicit-any
  return (result as { match: (...args: any[]) => any }).match({
    ok: (v: T) => v,
    err: (e: Error): never => {
      throw e;
    },
  }) as T;
}

export const router = {
  version: baseProcedure
    .route({
      method: "GET",
      path: "/version",
      description: "Get the Quark browser version",
    })
    .handler(() => {
      const browser = getBrowser();
      return { version: browser.version() };
    }),

  getQueueStatus: baseProcedure
    .route({
      method: "GET",
      path: "/get-queue-status",
      description: "Get the status of the browser operation queue",
    })
    .output(BrowserQueueStatusSchema)
    .handler(() => {
      return getBrowserQueueStatus();
    }),

  getLoginQRCode: baseProcedure
    .route({
      method: "GET",
      path: "/get-login-qrcode",
      description: getLoginQRCode.metadata.description,
    })
    .output(z.instanceof(File))
    .handler(async () => {
      const image = unwrap<Uint8Array>(await getLoginQRCode());
      return new File(
        [Uint8Array.from(image as Iterable<number>)],
        "login-qrcode.png",
        { type: "image/png" },
      );
    }),

  getLoginStatus: baseProcedure
    .route({
      method: "GET",
      path: "/get-login-status",
      description: getLoginStatus.metadata.description,
    })
    .output(z.object({ loggedIn: z.boolean() }))
    .handler(async () => {
      return unwrap(await getLoginStatus());
    }),

  getUserInfo: baseProcedure
    .route({
      method: "GET",
      path: "/get-user-info",
      description: getUserInfo.metadata.description,
    })
    .output(z.object({ capacity: z.string() }))
    .handler(async () => {
      return unwrap(await getUserInfo());
    }),

  getFileList: baseProcedure
    .route({
      method: "GET",
      path: "/get-file-list",
      inputStructure: "detailed",
      description: getFileList.metadata.description,
    })
    .input(z.object({
      query: z.object({ path: z.string().optional() }).optional(),
    }))
    .output(QuarkFileListSchema)
    .handler(async ({ input }) => {
      return unwrap(await getFileList(input.query?.path));
    }),

  downloadFile: baseProcedure
    .route({
      method: "GET",
      path: "/download-file",
      inputStructure: "detailed",
      description: downloadFile.metadata.description,
    })
    .input(z.object({ query: z.object({ path: z.string() }) }))
    .output(z.object({ name: z.string() }))
    .handler(async ({ input }) => {
      return unwrap(await downloadFile(input.query.path));
    }),

  getDownloadStatus: baseProcedure
    .route({
      method: "GET",
      path: "/get-download-status",
      inputStructure: "detailed",
      description: getDownloadStatus.metadata.description,
    })
    .input(z.object({
      query: z.object({
        status: QuarkDownloadStatusModeSchema.optional(),
      }).optional(),
    }))
    .output(QuarkDownloadStatusSchema)
    .handler(async ({ input }) => {
      return unwrap(await getDownloadStatus(input.query?.status));
    }),

  setDownloadStatus: baseProcedure
    .route({
      method: "POST",
      path: "/set-download-status",
      inputStructure: "detailed",
      description: setDownloadStatus.metadata.description,
    })
    .input(z.object({
      body: z.object({
        taskName: z.string(),
        operation: QuarkDownloadTaskOperationSchema,
      }),
    }))
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input }) => {
      return unwrap(
        await setDownloadStatus(input.body.taskName, input.body.operation),
      );
    }),
};
