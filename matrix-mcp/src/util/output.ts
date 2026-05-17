export type ToolResult = {
  content: Array<Record<string, unknown>>;
  structuredContent: Record<string, unknown>;
  isError: boolean;
};

export function toolTextResult(text: string, structuredContent: Record<string, unknown> = {}): ToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent,
    isError: false,
  };
}

export function toolImageResult(input: {
  text: string;
  data: string;
  mimeType: string;
  structuredContent?: Record<string, unknown>;
}): ToolResult {
  return {
    content: [
      { type: "text", text: input.text },
      { type: "image", data: input.data, mimeType: input.mimeType },
    ],
    structuredContent: input.structuredContent ?? {},
    isError: false,
  };
}

export function toolErrorResult(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: {},
    isError: true,
  };
}
