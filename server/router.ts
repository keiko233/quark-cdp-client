// ──────────────────────────────────────────────────────────────────────────────
// oRPC router. Keep API surface in sync with `server/mcp.ts`.
//
// The procedures here correspond to the MCP tools advertised by the sibling
// `server/mcp.ts` file. `server/mcp.ts` runs a startup parity check that
// throws if the two sides drift (a tool advertised but not dispatched, or a
// dispatch handler with no entry in `TOOLS`).
//
// When you add a new procedure here, also add the matching entry to
// `MCP_TOOL_HANDLERS` and `TOOLS` in `server/mcp.ts` — otherwise the server
// will refuse to start until both sides agree.
// ──────────────────────────────────────────────────────────────────────────────

import { getBrowser, getBrowserQueueStatus } from "../client/browser.ts";
import { getTask, listTasks } from "../client/task-queue.ts";
import {
  downloadFile,
  getDownloadStatus,
  getFileList,
  getLoginQRCode,
  getLoginStatus,
  getTaskAction,
  getUserInfo,
  importShareLink,
  listTasksAction,
  setDownloadStatus,
  submitDownloadFile,
  submitDownloadFiles,
} from "../client/actions/index.ts";
import {
  BrowserQueueStatusSchema,
  QuarkDownloadFileResultSchema,
  QuarkDownloadFilesRequestSchema,
  QuarkDownloadFilesResultSchema,
  QuarkDownloadStatusModeSchema,
  QuarkDownloadStatusSchema,
  QuarkDownloadTaskOperationSchema,
  QuarkFileListSchema,
  QuarkGetTaskResultSchema,
  QuarkListTasksFilterSchema,
  QuarkListTasksResultSchema,
  QuarkSubmitResultSchema,
} from "../libs/schemas.ts";
import { ORPCError } from "@orpc/server";
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
    .output(QuarkDownloadFileResultSchema)
    .handler(async ({ input }) => {
      return unwrap(await downloadFile(input.query.path));
    }),

  submitDownloadFile: baseProcedure
    .route({
      method: "POST",
      path: "/submit-download-file",
      inputStructure: "detailed",
      description: submitDownloadFile.metadata.description,
    })
    .input(z.object({ body: z.object({ path: z.string() }) }))
    .output(QuarkSubmitResultSchema)
    .handler(async ({ input }) => {
      return unwrap(await submitDownloadFile(input.body.path));
    }),

  submitDownloadFiles: baseProcedure
    .route({
      method: "POST",
      path: "/submit-download-files",
      inputStructure: "detailed",
      description: submitDownloadFiles.metadata.description,
    })
    .input(z.object({ body: QuarkDownloadFilesRequestSchema }))
    .output(QuarkDownloadFilesResultSchema)
    .handler(async ({ input }) => {
      return unwrap(await submitDownloadFiles(input.body));
    }),

  getTask: baseProcedure
    .route({
      method: "GET",
      path: "/get-task",
      inputStructure: "detailed",
      description: getTaskAction.metadata.description,
    })
    .input(z.object({ query: z.object({ id: z.string().uuid() }) }))
    .output(QuarkGetTaskResultSchema)
    .handler(async ({ input }) => {
      // Read directly from the in-memory task store. The `getTaskAction` MCP
      // tool still wraps the same call for parity, but the HTTP route skips
      // the `Result`/unwrap indirection so the types line up cleanly.
      const record = getTask(input.query.id);
      if (!record) {
        throw new ORPCError("NOT_FOUND", { message: "task not found" });
      }
      return record;
    }),

  listTasks: baseProcedure
    .route({
      method: "GET",
      path: "/list-tasks",
      inputStructure: "detailed",
      description: listTasksAction.metadata.description,
    })
    .input(z.object({ query: QuarkListTasksFilterSchema.optional() }).optional())
    .output(QuarkListTasksResultSchema)
    .handler(async ({ input }) => {
      return unwrap(await listTasksAction(input?.query));
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

  importShareLink: baseProcedure
    .route({
      method: "POST",
      path: "/import-share-link",
      inputStructure: "detailed",
      description: importShareLink.metadata.description,
    })
    .input(z.object({
      body: z.object({
        url: z.string(),
      }),
    }))
    .output(z.object({ url: z.string(), savedPath: z.string() }))
    .handler(async ({ input }) => {
      return unwrap(await importShareLink(input.body.url));
    }),
};
