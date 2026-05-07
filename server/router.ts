import { getBrowser } from "../client/browser.ts";
import {
  downloadFile,
  getDownloadStatus,
  getFileList,
  getLoginQRCode,
  getLoginStatus,
  getUserInfo,
} from "../client/actions/index.ts";
import z from "zod";
import { baseProcedure } from "./errors.ts";

export const router = {
  version: baseProcedure
    .route({ method: "GET", path: "/version" })
    .handler(() => {
      const browser = getBrowser();
      return {
        version: browser.version(),
      };
    }),

  getLoginQRCode: baseProcedure
    .route({ method: "GET", path: "/get-login-qrcode" })
    .output(z.instanceof(File))
    .handler(async () => {
      const image = await getLoginQRCode();
      const png = Uint8Array.from(image);

      return new File([png], "login-qrcode.png", {
        type: "image/png",
      });
    }),

  getLoginStatus: baseProcedure
    .route({ method: "GET", path: "/get-login-status" })
    .output(z.object({
      loggedIn: z.boolean(),
    }))
    .handler(async () => {
      return await getLoginStatus();
    }),

  getUserInfo: baseProcedure
    .route({ method: "GET", path: "/get-user-info" })
    .output(z.object({
      capacity: z.string(),
    }))
    .handler(async () => {
      return await getUserInfo();
    }),

  getFileList: baseProcedure
    .route({
      method: "GET",
      path: "/get-file-list",
      inputStructure: "detailed",
    })
    .input(
      z.object({
        query: z.object({
          path: z.string().optional(),
        }).optional(),
      }),
    )
    .output(z.object({
      path: z.array(z.string()),
      items: z.array(z.object({
        name: z.string(),
        size: z.string(),
        type: z.string(),
        updatedAt: z.string(),
      })),
    }))
    .handler(async ({ input }) => {
      return await getFileList(input.query?.path);
    }),

  downloadFile: baseProcedure
    .route({
      method: "GET",
      path: "/download-file",
      inputStructure: "detailed",
    })
    .input(
      z.object({
        query: z.object({
          path: z.string(),
        }),
      }),
    )
    .output(z.object({
      name: z.string(),
    }))
    .handler(async ({ input }) => {
      return await downloadFile(input.query.path);
    }),

  getDownloadStatus: baseProcedure
    .route({
      method: "GET",
      path: "/get-download-status",
      inputStructure: "detailed",
    })
    .input(
      z.object({
        query: z.object({
          status: z.enum(["running", "complete", "all"]).optional(),
        }).optional(),
      }),
    )
    .output(z.object({
      tasks: z.array(z.object({
        state: z.enum(["running", "complete"]),
        name: z.string(),
        size: z.string(),
        progress: z.string(),
        speed: z.string(),
        remaining: z.string(),
        completedAt: z.string(),
      })),
    }))
    .handler(async ({ input }) => {
      return await getDownloadStatus(input.query?.status);
    }),
};
