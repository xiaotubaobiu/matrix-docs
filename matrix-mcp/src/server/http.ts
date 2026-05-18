import { extractBearerToken } from "./auth.js";
import { buildHealthPayload } from "./health.js";
import { toHttpErrorResponse, HttpError } from "./errors.js";

export function buildHttpHandler(config: {
  mcpPath: string;
  serviceName: string;
  version: string;
  mcpHandler?: (message: unknown, context: { token: string }) => Promise<unknown>;
  verifyToken?: (token: string) => Promise<void>;
}) {
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(buildHealthPayload(config.serviceName, config.version));
    }

    if (url.pathname !== config.mcpPath) {
      return new Response("Not Found", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }

    try {
      const token = extractBearerToken(request.headers);
      if (config.verifyToken) {
        await config.verifyToken(token);
      }
      const message = await request.json();

      const handler = config.mcpHandler;
      if (!handler) {
        throw new HttpError(501, "mcp_not_configured", "MCP handler not configured");
      }

      const payload = await handler(message, { token });
      return Response.json(payload);
    } catch (error) {
      return toHttpErrorResponse(error);
    }
  };
}
