import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { HttpError } from "./errors.js";
import { buildHealthPayload } from "./health.js";
import { buildHttpHandler } from "./http.js";
import { createMcpJsonRpcHandler } from "./mcp.js";

test("health payload uses matrix-mcp service name", () => {
  assert.deepEqual(buildHealthPayload("matrix-mcp", "0.1.0"), {
    ok: true,
    service: "matrix-mcp",
    version: "0.1.0",
  });
});

test("health endpoint returns ok payload", async () => {
  const handler = buildHttpHandler({
    mcpPath: "/mcp",
    serviceName: "matrix-mcp",
    version: "0.1.0",
  });

  const response = await handler(
    new Request("http://127.0.0.1:8765/health", { method: "GET" }),
  );

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data, {
    ok: true,
    service: "matrix-mcp",
    version: "0.1.0",
  });
});

test("initialize returns protocol version and server info", async () => {
  const handler = buildHttpHandler({
    mcpPath: "/mcp",
    serviceName: "matrix-mcp",
    version: "0.1.0",
    mcpHandler: createMcpJsonRpcHandler({
      serviceName: "matrix-mcp",
      version: "0.1.0",
      tools: [],
    }),
  });

  const response = await handler(new Request("http://127.0.0.1:8765/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.protocolVersion, "2025-03-26");
  assert.equal(payload.result.serverInfo.name, "matrix-mcp");
});

test("mcp post requires bearer token", async () => {
  const handler = buildHttpHandler({
    mcpPath: "/mcp",
    serviceName: "matrix-mcp",
    version: "0.1.0",
    verifyToken: async () => {
      throw new Error("verifyToken should not be called when auth header is missing");
    },
    mcpHandler: createMcpJsonRpcHandler({
      serviceName: "matrix-mcp",
      version: "0.1.0",
      tools: [],
    }),
  });

  const response = await handler(new Request("http://127.0.0.1:8765/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  }));

  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: {
      code: "missing_bearer_token",
      message: "Missing Bearer token",
    },
  });
});

test("initialize verifies bearer token before dispatch", async () => {
  let verifiedToken: string | undefined;
  const handler = buildHttpHandler({
    mcpPath: "/mcp",
    serviceName: "matrix-mcp",
    version: "0.1.0",
    verifyToken: async (token) => {
      verifiedToken = token;
    },
    mcpHandler: createMcpJsonRpcHandler({
      serviceName: "matrix-mcp",
      version: "0.1.0",
      tools: [],
    }),
  });

  const response = await handler(new Request("http://127.0.0.1:8765/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer verified-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  }));

  assert.equal(response.status, 200);
  assert.equal(verifiedToken, "verified-token");
});

test("mcp post rejects invalid bearer token after verification", async () => {
  const handler = buildHttpHandler({
    mcpPath: "/mcp",
    serviceName: "matrix-mcp",
    version: "0.1.0",
    verifyToken: async () => {
      throw new HttpError(401, "invalid_token", "Bearer token is invalid or unauthorized");
    },
    mcpHandler: createMcpJsonRpcHandler({
      serviceName: "matrix-mcp",
      version: "0.1.0",
      tools: [],
    }),
  });

  const response = await handler(new Request("http://127.0.0.1:8765/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer bad-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "ping" }),
  }));

  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: {
      code: "invalid_token",
      message: "Bearer token is invalid or unauthorized",
    },
  });
});

test("mcp post surfaces token verification upstream failure", async () => {
  const handler = buildHttpHandler({
    mcpPath: "/mcp",
    serviceName: "matrix-mcp",
    version: "0.1.0",
    verifyToken: async () => {
      throw new HttpError(502, "token_verification_failed", "Token verification upstream returned HTTP 500");
    },
    mcpHandler: createMcpJsonRpcHandler({
      serviceName: "matrix-mcp",
      version: "0.1.0",
      tools: [],
    }),
  });

  const response = await handler(new Request("http://127.0.0.1:8765/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer flaky-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 8, method: "ping" }),
  }));

  assert.equal(response.status, 502);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: {
      code: "token_verification_failed",
      message: "Token verification upstream returned HTTP 500",
    },
  });
});

test("tools/list returns injected tools", async () => {
  const handler = buildHttpHandler({
    mcpPath: "/mcp",
    serviceName: "matrix-mcp",
    version: "0.1.0",
    mcpHandler: createMcpJsonRpcHandler({
      serviceName: "matrix-mcp",
      version: "0.1.0",
      tools: [{
        name: "demo-tool",
        description: "Demo tool",
        inputSchema: { type: "object", properties: {} },
        async call() {
          return { content: [{ type: "text", text: "ok" }], isError: false };
        },
      }],
    }),
  });

  const response = await handler(new Request("http://127.0.0.1:8765/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.tools[0].name, "demo-tool");
});

test("tools/call dispatches to injected tool", async () => {
  const handler = buildHttpHandler({
    mcpPath: "/mcp",
    serviceName: "matrix-mcp",
    version: "0.1.0",
    mcpHandler: createMcpJsonRpcHandler({
      serviceName: "matrix-mcp",
      version: "0.1.0",
      tools: [{
        name: "echo-tool",
        description: "Echo tool",
        inputSchema: { type: "object", properties: { message: { type: "string" } } },
        async call(arguments_, context) {
          return {
            content: [{ type: "text", text: String(arguments_.message ?? "") }],
            structuredContent: { token: context.token },
            isError: false,
          };
        },
      }],
    }),
  });

  const response = await handler(new Request("http://127.0.0.1:8765/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer abc123",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "echo-tool", arguments: { message: "hello" } },
    }),
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.content[0].text, "hello");
  assert.equal(payload.result.structuredContent.token, "abc123");
});

test("ping returns empty result", async () => {
  const handler = buildHttpHandler({
    mcpPath: "/mcp",
    serviceName: "matrix-mcp",
    version: "0.1.0",
    mcpHandler: createMcpJsonRpcHandler({
      serviceName: "matrix-mcp",
      version: "0.1.0",
      tools: [],
    }),
  });

  const response = await handler(new Request("http://127.0.0.1:8765/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "ping" }),
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.result, {});
});

test("mcp post without handler returns 501 error", async () => {
  const handler = buildHttpHandler({
    mcpPath: "/mcp",
    serviceName: "matrix-mcp",
    version: "0.1.0",
  });

  const response = await handler(new Request("http://127.0.0.1:8765/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "ping" }),
  }));

  assert.equal(response.status, 501);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: {
      code: "mcp_not_configured",
      message: "MCP handler not configured",
    },
  });
});

test("mcp post maps invalid tool input to 400 response", async () => {
  const handler = buildHttpHandler({
    mcpPath: "/mcp",
    serviceName: "matrix-mcp",
    version: "0.1.0",
    mcpHandler: createMcpJsonRpcHandler({
      serviceName: "matrix-mcp",
      version: "0.1.0",
      tools: [{
        name: "validated-tool",
        description: "Validated tool",
        inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        async call() {
          throw new z.ZodError([
            {
              code: "invalid_type",
              expected: "string",
              received: "undefined",
              path: ["query"],
              message: "Required",
            },
          ]);
        },
      }],
    }),
  });

  const response = await handler(new Request("http://127.0.0.1:8765/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "validated-tool", arguments: {} },
    }),
  }));

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: {
      code: "invalid_request",
      message: "query: Required",
    },
  });
});
