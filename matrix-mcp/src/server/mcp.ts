const PROTOCOL_VERSION = "2025-03-26";

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call(arguments_: Record<string, unknown>, context: { token: string }): Promise<Record<string, unknown>>;
};

function result(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function error(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function createMcpJsonRpcHandler(input: {
  serviceName: string;
  version: string;
  tools: ToolDefinition[];
}) {
  const toolMap = new Map(input.tools.map((tool) => [tool.name, tool]));

  return async function handle(message: any, context: { token: string }) {
    const id = message?.id ?? null;
    const method = message?.method;

    if (method === "initialize") {
      return result(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: input.serviceName, version: input.version },
      });
    }

    if (method === "ping") {
      return result(id, {});
    }

    if (method === "tools/list") {
      return result(id, {
        tools: input.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
    }

    if (method === "tools/call") {
      const name = message?.params?.name;
      const arguments_ = message?.params?.arguments ?? {};
      const tool = toolMap.get(name);
      if (!tool) {
        return error(id, -32602, `Unknown tool: ${name}`);
      }
      return result(id, await tool.call(arguments_, context));
    }

    return error(id, -32601, `Method not found: ${method}`);
  };
}
