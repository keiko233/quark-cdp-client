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

export const QuarkDownloadFileResultSchema = z.object({
  name: z.string(),
  alreadyQueued: z.boolean().optional(),
});

export const QuarkTaskStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const QuarkTaskRecordSchema = z.object({
  id: z.string(),
  label: z.string(),
  args: z.unknown(),
  status: QuarkTaskStatusSchema,
  createdAt: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative().optional(),
  completedAt: z.number().int().nonnegative().optional(),
  result: z.unknown().optional(),
  error: z.object({
    name: z.string(),
    message: z.string(),
    stack: z.string().optional(),
  }).optional(),
});

export const QuarkSubmitResultSchema = z.object({
  taskId: z.string().uuid(),
});

export const QuarkDownloadFilesRequestSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(100),
});

export const QuarkDownloadFilesResultSchema = z.object({
  taskIds: z.array(z.string().uuid()),
});

export const QuarkListTasksFilterSchema = z.object({
  status: QuarkTaskStatusSchema.optional(),
  label: z.string().optional(),
});

export const QuarkListTasksResultSchema = z.object({
  tasks: z.array(QuarkTaskRecordSchema),
});

export const QuarkGetTaskResultSchema = QuarkTaskRecordSchema;

export type QuarkFileListItem = z.infer<typeof QuarkFileListItemSchema>;
export type QuarkFileList = z.infer<typeof QuarkFileListSchema>;
export type QuarkDownloadTask = z.infer<typeof QuarkDownloadTaskSchema>;
export type QuarkDownloadStatus = z.infer<typeof QuarkDownloadStatusSchema>;
export type QuarkDownloadTaskState = z.infer<typeof QuarkDownloadTaskStateSchema>;
export type QuarkDownloadStatusMode = z.infer<typeof QuarkDownloadStatusModeSchema>;
export type QuarkDownloadTaskOperation = z.infer<typeof QuarkDownloadTaskOperationSchema>;
export type BrowserQueueStatus = z.infer<typeof BrowserQueueStatusSchema>;
export type QuarkDownloadFileResult = z.infer<typeof QuarkDownloadFileResultSchema>;
export type QuarkTaskStatus = z.infer<typeof QuarkTaskStatusSchema>;
export type QuarkTaskRecord<TArgs = unknown, TValue = unknown> = Omit<
  z.infer<typeof QuarkTaskRecordSchema>,
  "args" | "result"
> & { args: TArgs; result?: TValue };
export type QuarkSubmitResult = z.infer<typeof QuarkSubmitResultSchema>;
export type QuarkDownloadFilesRequest = z.infer<
  typeof QuarkDownloadFilesRequestSchema
>;
export type QuarkDownloadFilesResult = z.infer<
  typeof QuarkDownloadFilesResultSchema
>;
export type QuarkListTasksFilter = z.infer<typeof QuarkListTasksFilterSchema>;
export type QuarkListTasksResult = z.infer<typeof QuarkListTasksResultSchema>;
export type QuarkGetTaskResult = z.infer<typeof QuarkGetTaskResultSchema>;
