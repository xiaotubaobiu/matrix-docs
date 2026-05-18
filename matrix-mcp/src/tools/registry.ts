import type { AppConfig } from "../config/env.js";
import type { ToolDefinition } from "../server/mcp.js";
import { createGenerateImageTool } from "./generate-image.js";

export function buildTools(config: AppConfig): ToolDefinition[] {
  return [
    createGenerateImageTool(config),
  ];
}
