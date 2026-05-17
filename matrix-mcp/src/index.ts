import { createServer } from "node:http";
import { loadConfig } from "./config/env.js";
import { verifyNewApiToken } from "./providers/newapi/token.js";
import { buildHttpHandler } from "./server/http.js";
import { createMcpJsonRpcHandler } from "./server/mcp.js";
import { buildTools } from "./tools/registry.js";

const config = loadConfig();
const tools = buildTools(config);
const mcpHandler = createMcpJsonRpcHandler({
  serviceName: config.serviceName,
  version: config.version,
  tools,
});

const handler = buildHttpHandler({
  mcpPath: config.mcpPath,
  serviceName: config.serviceName,
  version: config.version,
  verifyToken: async (token) => verifyNewApiToken({
    baseUrl: config.newApiBaseUrl,
    verifyPath: config.newApiTokenVerifyPath,
    token,
    timeoutMs: config.requestTimeoutMs,
  }),
  mcpHandler,
});

createServer(async (req, res) => {
  try {
    let body: Buffer | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        let settled = false;

        req.on("data", (chunk) => {
          if (settled) return;
          const buffer = Buffer.from(chunk);
          totalBytes += buffer.byteLength;
          if (totalBytes > config.maxRequestBodyBytes) {
            settled = true;
            reject(new Error(`Request body exceeds limit of ${config.maxRequestBodyBytes} bytes`));
            req.destroy();
            return;
          }
          chunks.push(buffer);
        });
        req.on("end", () => {
          if (settled) return;
          settled = true;
          resolve(Buffer.concat(chunks));
        });
        req.on("error", (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
      });
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers[key] = Array.isArray(value) ? value[0] : value;
      }
    }

    const host = req.headers.host || `${config.host}:${config.port}`;
    const requestUrl = `http://${host}${req.url}`;

    const request = new Request(requestUrl, {
      method: req.method,
      headers,
      body: body as any,
    });

    const response = await handler(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const arrayBuffer = await response.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("Request body exceeds limit") ? 413 : 500;
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      error: {
        code: status === 413 ? "request_too_large" : "internal_error",
        message,
      },
    }));
  }
}).listen(config.port, config.host, () => {
  console.log(`matrix-mcp listening on http://${config.host}:${config.port}${config.mcpPath}`);
});
