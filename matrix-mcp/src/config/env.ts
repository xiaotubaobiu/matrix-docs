import { HttpError } from "../server/errors.js";

export type AppConfig = {
  host: string;
  port: number;
  mcpPath: string;
  serviceName: string;
  version: string;
  newApiBaseUrl: string;
  newApiTokenVerifyPath: string;
  imageModel: string;
  imageOutputDir: string;
  requestTimeoutMs: number;
  maxRequestBodyBytes: number;
};

function invalidConfig(name: string, message: string): never {
  throw new HttpError(500, "invalid_config", `Invalid ${name}: ${message}`);
}

function parseInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  if (!trimmed) {
    invalidConfig(name, "must be an integer");
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    invalidConfig(name, "must be an integer");
  }
  return parsed;
}

function parsePort(value: string | undefined): number {
  const port = parseInteger(value, 8767, "PORT");
  if (port < 1 || port > 65535) {
    invalidConfig("PORT", "must be an integer between 1 and 65535");
  }
  return port;
}

function parseRequestTimeoutMs(value: string | undefined): number {
  const timeout = parseInteger(value, 600000, "REQUEST_TIMEOUT_MS");
  if (timeout < 0) {
    invalidConfig("REQUEST_TIMEOUT_MS", "must be an integer greater than or equal to 0");
  }
  return timeout;
}

function parseMaxRequestBodyBytes(value: string | undefined): number {
  const limit = parseInteger(value, 1048576, "MAX_REQUEST_BODY_BYTES");
  if (limit <= 0) {
    invalidConfig("MAX_REQUEST_BODY_BYTES", "must be a positive integer");
  }
  return limit;
}

export function loadConfig(env = process.env): AppConfig {
  return {
    host: env.HOST ?? "127.0.0.1",
    port: parsePort(env.PORT),
    mcpPath: env.MCP_PATH ?? "/mcp",
    serviceName: env.SERVICE_NAME ?? "matrix-image-mcp",
    version: env.SERVICE_VERSION ?? "0.1.0",
    newApiBaseUrl: (env.NEWAPI_BASE_URL ?? "https://matrix.000328.xyz:2053").replace(/\/$/, ""),
    newApiTokenVerifyPath: env.NEWAPI_TOKEN_VERIFY_PATH ?? "/api/token/test",
    imageModel: env.IMAGE_MODEL ?? "gpt-image-2",
    imageOutputDir: env.IMAGE_OUTPUT_DIR ?? "/app/output",
    requestTimeoutMs: parseRequestTimeoutMs(env.REQUEST_TIMEOUT_MS),
    maxRequestBodyBytes: parseMaxRequestBodyBytes(env.MAX_REQUEST_BODY_BYTES),
  };
}
