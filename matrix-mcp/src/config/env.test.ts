import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./env.js";
import { HttpError } from "../server/errors.js";

test("loadConfig uses defaults when env vars are missing", () => {
  const config = loadConfig({});
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 8767);
  assert.equal(config.mcpPath, "/mcp");
  assert.equal(config.serviceName, "matrix-image-mcp");
  assert.equal(config.version, "0.1.0");
  assert.equal(config.newApiBaseUrl, "https://matrix.000328.xyz:2053");
  assert.equal(config.newApiTokenVerifyPath, "/api/token/test");
  assert.equal(config.imageModel, "gpt-image-2");
  assert.equal(config.imageOutputDir, "/app/output");
  assert.equal(config.requestTimeoutMs, 600000);
  assert.equal(config.maxRequestBodyBytes, 1048576);
  assert.equal((config as any).defaultChatModel, undefined);
});

test("loadConfig does not expose removed MiMo chat settings", () => {
  const config = loadConfig({
    HOST: "0.0.0.0",
    PORT: "8767",
    SERVICE_NAME: "matrix-image-mcp",
    DEFAULT_CHAT_MODEL: "removed-model",
    NEWAPI_BASE_URL: "https://matrix.000328.xyz:2053",
  } as NodeJS.ProcessEnv);

  assert.equal((config as any).defaultChatModel, undefined);
  assert.equal(config.newApiBaseUrl, "https://matrix.000328.xyz:2053");
});

test("loadConfig overrides defaults with env vars", () => {
  const config = loadConfig({
    HOST: "0.0.0.0",
    PORT: "3000",
    MCP_PATH: "/mcp-endpoint",
    SERVICE_NAME: "test-service",
    SERVICE_VERSION: "2.0.0",
    DEFAULT_CHAT_MODEL: "removed-model",
    NEWAPI_BASE_URL: "https://custom-newapi.example/",
    NEWAPI_TOKEN_VERIFY_PATH: "/token/validate",
    IMAGE_MODEL: "gpt-image-2-pro",
    IMAGE_OUTPUT_DIR: "/custom/output",
    REQUEST_TIMEOUT_MS: "60000",
    MAX_REQUEST_BODY_BYTES: "2097152",
  });
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 3000);
  assert.equal(config.mcpPath, "/mcp-endpoint");
  assert.equal(config.serviceName, "test-service");
  assert.equal(config.version, "2.0.0");
  assert.equal((config as any).defaultChatModel, undefined);
  assert.equal(config.newApiBaseUrl, "https://custom-newapi.example");
  assert.equal(config.newApiTokenVerifyPath, "/token/validate");
  assert.equal(config.imageModel, "gpt-image-2-pro");
  assert.equal(config.imageOutputDir, "/custom/output");
  assert.equal(config.requestTimeoutMs, 60000);
  assert.equal(config.maxRequestBodyBytes, 2097152);
});

test("loadConfig throws on invalid PORT", () => {
  assert.throws(
    () => loadConfig({ PORT: "invalid" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("PORT"));
      return true;
    },
  );
});

test("loadConfig throws on empty PORT", () => {
  assert.throws(
    () => loadConfig({ PORT: "" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("PORT"));
      return true;
    },
  );
});

test("loadConfig throws on whitespace-only PORT", () => {
  assert.throws(
    () => loadConfig({ PORT: "   " }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("PORT"));
      return true;
    },
  );
});

test("loadConfig throws on fractional PORT", () => {
  assert.throws(
    () => loadConfig({ PORT: "3000.5" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("PORT"));
      assert.ok(error.message.includes("integer"));
      return true;
    },
  );
});

test("loadConfig throws on zero PORT", () => {
  assert.throws(
    () => loadConfig({ PORT: "0" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("PORT"));
      assert.ok(error.message.includes("between 1 and 65535"));
      return true;
    },
  );
});

test("loadConfig throws on out-of-range PORT", () => {
  assert.throws(
    () => loadConfig({ PORT: "65536" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("PORT"));
      assert.ok(error.message.includes("between 1 and 65535"));
      return true;
    },
  );
});

test("loadConfig throws on Infinity PORT", () => {
  assert.throws(
    () => loadConfig({ PORT: "Infinity" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("PORT"));
      return true;
    },
  );
});

test("loadConfig throws on fractional REQUEST_TIMEOUT_MS", () => {
  assert.throws(
    () => loadConfig({ REQUEST_TIMEOUT_MS: "12.5" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("REQUEST_TIMEOUT_MS"));
      assert.ok(error.message.includes("integer"));
      return true;
    },
  );
});

test("loadConfig throws on negative REQUEST_TIMEOUT_MS", () => {
  assert.throws(
    () => loadConfig({ REQUEST_TIMEOUT_MS: "-1" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("REQUEST_TIMEOUT_MS"));
      assert.ok(error.message.includes("greater than or equal to 0"));
      return true;
    },
  );
});

test("loadConfig throws on -Infinity REQUEST_TIMEOUT_MS", () => {
  assert.throws(
    () => loadConfig({ REQUEST_TIMEOUT_MS: "-Infinity" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("REQUEST_TIMEOUT_MS"));
      return true;
    },
  );
});

test("loadConfig throws on invalid REQUEST_TIMEOUT_MS", () => {
  assert.throws(
    () => loadConfig({ REQUEST_TIMEOUT_MS: "not-a-number" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("REQUEST_TIMEOUT_MS"));
      return true;
    },
  );
});

test("loadConfig throws on fractional MAX_REQUEST_BODY_BYTES", () => {
  assert.throws(
    () => loadConfig({ MAX_REQUEST_BODY_BYTES: "1024.5" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("MAX_REQUEST_BODY_BYTES"));
      assert.ok(error.message.includes("integer"));
      return true;
    },
  );
});

test("loadConfig throws on zero MAX_REQUEST_BODY_BYTES", () => {
  assert.throws(
    () => loadConfig({ MAX_REQUEST_BODY_BYTES: "0" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("MAX_REQUEST_BODY_BYTES"));
      assert.ok(error.message.includes("positive integer"));
      return true;
    },
  );
});

test("loadConfig throws on negative MAX_REQUEST_BODY_BYTES", () => {
  assert.throws(
    () => loadConfig({ MAX_REQUEST_BODY_BYTES: "-1" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("MAX_REQUEST_BODY_BYTES"));
      assert.ok(error.message.includes("positive integer"));
      return true;
    },
  );
});

test("loadConfig throws on invalid MAX_REQUEST_BODY_BYTES", () => {
  assert.throws(
    () => loadConfig({ MAX_REQUEST_BODY_BYTES: "abc" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_config");
      assert.ok(error.message.includes("MAX_REQUEST_BODY_BYTES"));
      return true;
    },
  );
});
