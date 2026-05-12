import type { Hono } from "hono";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { getBrowser, getBrowserQueueStatus } from "../client/browser.ts";
import {
  downloadFile,
  getDownloadStatus,
  getFileList,
  getLoginQRCode,
  getLoginStatus,
  getUserInfo,
  quarkActions,
  setDownloadStatus,
} from "../client/actions/index.ts";
import type {
  QuarkDownloadStatusMode,
  QuarkDownloadTaskOperation,
} from "../libs/schemas.ts";
import { log } from "../libs/logger.ts";

// ── MCP protocol types ────────────────────────────────────────────────────────

type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image"; data: string; mimeType: string };
type ToolContent = TextContent | ImageContent;

type ToolResult = { content: ToolContent[]; isError?: boolean };

type JsonRpcRequest = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
  id?: string | number | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function unwrap<T>(result: any): T {
  // deno-lint-ignore no-explicit-any
  return (result as { match: (...args: any[]) => any }).match({
    ok: (v: T) => v,
    err: (e: Error): never => {
      throw e;
    },
  }) as T;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function text(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function errResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const zodToJsonSchemaConverter = new ZodToJsonSchemaConverter();

const TOOLS = [
  {
    name: "get_version",
    description: "Get the Quark browser version",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_queue_status",
    description: "Get the status of the browser operation queue",
    inputSchema: { type: "object", properties: {} },
  },
  ...quarkActions.map((action) => ({
    name: action.metadata.mcp.name,
    description: action.metadata.description,
    inputSchema: zodToJsonSchemaConverter.convert(action.metadata.mcp.input, {
      strategy: "input",
    })[1],
  })),
];

// ── Tool dispatch ─────────────────────────────────────────────────────────────

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "get_version": {
      const browser = getBrowser();
      return text({ version: browser.version() });
    }

    case "get_queue_status":
      return text(getBrowserQueueStatus());

    case "get_login_qrcode": {
      const bytes = unwrap<Uint8Array>(await getLoginQRCode());
      return {
        content: [{
          type: "image",
          data: toBase64(bytes),
          mimeType: "image/png",
        }],
      };
    }

    case "get_login_status":
      return text(unwrap<{ loggedIn: boolean }>(await getLoginStatus()));

    case "get_user_info":
      return text(unwrap<{ capacity: string }>(await getUserInfo()));

    case "get_file_list":
      return text(unwrap(await getFileList(args.path as string | undefined)));

    case "download_file":
      return text(unwrap(await downloadFile(args.path as string)));

    case "get_download_status":
      return text(
        unwrap(
          await getDownloadStatus(
            args.status as QuarkDownloadStatusMode | undefined,
          ),
        ),
      );

    case "set_download_status":
      return text(
        unwrap(
          await setDownloadStatus(
            args.taskName as string,
            args.operation as QuarkDownloadTaskOperation,
          ),
        ),
      );

    default:
      return errResult(`Unknown tool: ${name}`);
  }
}

// ── Route setup ───────────────────────────────────────────────────────────────

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "quark-remote-client", version: "1.0.0" };

export function setupMcpRoute(app: Hono): void {
  app.post("/mcp", async (c) => {
    let body: JsonRpcRequest;
    try {
      body = await c.req.json();
    } catch {
      return c.json({
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      });
    }

    const { method, params, id } = body;
    const isNotification = id === undefined || id === null;

    const respond = (result: unknown) =>
      c.json({ jsonrpc: "2.0", result, id: id ?? null });

    const respondError = (code: number, message: string) =>
      c.json({ jsonrpc: "2.0", error: { code, message }, id: id ?? null });

    try {
      switch (method) {
        case "initialize": {
          const { protocolVersion } = (params ?? {}) as {
            protocolVersion?: string;
          };
          log.debug(
            `MCP initialize: client requested version ${protocolVersion}`,
          );
          return respond({
            protocolVersion: PROTOCOL_VERSION,
            serverInfo: SERVER_INFO,
            capabilities: { tools: {} },
          });
        }

        case "notifications/initialized":
          // Client notification — no response
          return c.body(null, 204);

        case "ping":
          return isNotification ? c.body(null, 204) : respond({});

        case "tools/list":
          return respond({ tools: TOOLS });

        case "tools/call": {
          const { name, arguments: args = {} } = (params ?? {}) as {
            name: string;
            arguments?: Record<string, unknown>;
          };
          log.debug(`MCP tools/call: ${name}`);
          const result = await callTool(name, args as Record<string, unknown>);
          return respond(result);
        }

        default:
          return respondError(-32601, `Method not found: ${method}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`MCP error in "${method}": ${message}`);
      if (isNotification) return c.body(null, 204);
      return respondError(-32603, message);
    }
  });

  log.debug("MCP endpoint mounted at POST /mcp");
}
