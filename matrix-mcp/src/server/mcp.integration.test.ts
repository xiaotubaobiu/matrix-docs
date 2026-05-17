import test from "node:test";
import assert from "node:assert/strict";
import { createMcpJsonRpcHandler } from "./mcp.js";

test("tools/list returns one configured tool", async () => {
  const handler = createMcpJsonRpcHandler({
    serviceName: "matrix-image-mcp",
    version: "0.1.0",
    tools: [
      { name: "generate_image", description: "", inputSchema: {}, async call() { return {}; } },
    ],
  });

  const response = await handler({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { token: "t" });
  assert.deepEqual((response as any).result.tools.map((tool: { name: string }) => tool.name), ["generate_image"]);
});

test("tools/call passes auth context token to generate_image style tool", async () => {
  const handler = createMcpJsonRpcHandler({
    serviceName: "matrix-image-mcp",
    version: "0.1.0",
    tools: [
      {
        name: "generate_image",
        description: "",
        inputSchema: {},
        async call(_arguments, context) {
          return { token: context.token };
        },
      },
    ],
  });

  const response = await handler(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "generate_image", arguments: { prompt: "hello" } },
    },
    { token: "bearer-123" },
  );

  assert.equal((response as any).result.token, "bearer-123");
});
