// ──────────────────────────────────────────────────────────────────────────────
// Sibling to `createAction` for fire-and-track style invocations. Returns a
// taskId immediately and runs the impl behind the task queue, instead of
// awaiting the result and returning a `Result<Value, Error>`.
//
// The metadata contract is identical to `createAction` (so MCP tool enumeration
// and the parity check work the same way), and the `impl` field is exposed on
// the returned object so a thin sync wrapper can await it via
// `await asyncAction.impl(...args)`. See `downloadFile` for an example.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import * as taskQueue from "../task-queue.ts";

export type ActionMetadata = {
  label: string;
  description: string;
  mcp: {
    name: string;
    input: z.ZodType;
  };
};

export type AsyncAction<Args extends unknown[], Value> =
  & ((...args: Args) => Promise<{ taskId: string }>)
  & {
    metadata: ActionMetadata;
    impl: (...args: Args) => Promise<Value>;
  };

export function createAsyncAction<Args extends unknown[], Value>(
  label: string,
  impl: (...args: Args) => Promise<Value>,
  options: {
    description: string;
    mcp: {
      name: string;
      input?: z.ZodType;
    };
  },
): AsyncAction<Args, Value> {
  const action = ((...args: Args) =>
    taskQueue.submit(label, impl, args)) as AsyncAction<Args, Value>;

  action.metadata = {
    label,
    description: options.description,
    mcp: {
      name: options.mcp.name,
      input: options.mcp.input ?? z.object({}),
    },
  };
  action.impl = impl;

  return action;
}
