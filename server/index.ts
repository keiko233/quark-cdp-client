import { Hono } from "hono";
import { onError } from "@orpc/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { SERVER_PORT } from "../libs/env.ts";
import { log } from "../libs/logger.ts";
import { router } from "./router.ts";
import { setupMcpRoute } from "./mcp.ts";

const app = new Hono();

setupMcpRoute(app);

const handler = new OpenAPIHandler(router, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [
        new ZodToJsonSchemaConverter(),
      ],
      specGenerateOptions: {
        info: {
          title: "Quark Remote Client API",
          version: "1.0.0",
        },
      },
    }),
  ],
  interceptors: [
    onError((error) => {
      log.error("oRPC error:", error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const { matched, response } = await handler.handle(c.req.raw, {
    context: {},
  });

  if (matched) {
    return c.newResponse(response.body, response);
  }

  await next();
});

export function startServer(): void {
  Deno.serve({ port: SERVER_PORT }, app.fetch);
  log.debug(`oRPC/Hono server listening on port ${SERVER_PORT}`);
  log.debug(`API docs: http://localhost:${SERVER_PORT}/`);
  log.debug(`OpenAPI spec: http://localhost:${SERVER_PORT}/spec.json`);
  log.debug(`MCP endpoint: http://localhost:${SERVER_PORT}/mcp`);
}
