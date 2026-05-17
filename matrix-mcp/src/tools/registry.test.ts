import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../config/env.js";

test("tool registry exposes only generate_image", async () => {
  const registry = await import("./registry.js").catch(() => null);
  assert.ok(registry, "registry module should exist");

  const tools = registry.buildTools(loadConfig({
    NEWAPI_BASE_URL: "https://matrix.000328.xyz:2053",
    IMAGE_MODEL: "gpt-image-2",
    IMAGE_OUTPUT_DIR: "/tmp",
    REQUEST_TIMEOUT_MS: "1000",
  }));

  assert.deepEqual(tools.map((tool: { name: string }) => tool.name), ["generate_image"]);
});
