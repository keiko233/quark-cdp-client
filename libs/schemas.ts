import { z } from "zod";

export const QuarkDownloadTaskStateSchema = z.enum(["running", "complete"]);
export const QuarkDownloadStatusModeSchema = z.enum(["running", "complete", "all"]);
export const QuarkDownloadTaskOperationSchema = z.enum(["resume", "pause", "delete"]);

export const QuarkFileListItemSchema = z.object({
  name: z.string(),
  size: z.string(),
  type: z.string(),
  updatedAt: z.string(),
});

export const QuarkFileListSchema = z.object({
  path: z.array(z.string()),
  items: z.array(QuarkFileListItemSchema),
});

export const QuarkDownloadTaskSchema = z.object({
  state: QuarkDownloadTaskStateSchema,
  name: z.string(),
  size: z.string(),
  progress: z.string(),
  speed: z.string(),
  remaining: z.string(),
  completedAt: z.string(),
});

export const QuarkDownloadStatusSchema = z.object({
  tasks: z.array(QuarkDownloadTaskSchema),
});

export const BrowserQueueStatusSchema = z.object({
  running: z.boolean(),
  current: z.string().nullable(),
  queued: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type QuarkFileListItem = z.infer<typeof QuarkFileListItemSchema>;
export type QuarkFileList = z.infer<typeof QuarkFileListSchema>;
export type QuarkDownloadTask = z.infer<typeof QuarkDownloadTaskSchema>;
export type QuarkDownloadStatus = z.infer<typeof QuarkDownloadStatusSchema>;
export type QuarkDownloadTaskState = z.infer<typeof QuarkDownloadTaskStateSchema>;
export type QuarkDownloadStatusMode = z.infer<typeof QuarkDownloadStatusModeSchema>;
export type QuarkDownloadTaskOperation = z.infer<typeof QuarkDownloadTaskOperationSchema>;
export type BrowserQueueStatus = z.infer<typeof BrowserQueueStatusSchema>;
