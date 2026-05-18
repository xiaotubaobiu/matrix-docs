import test from "node:test";
import assert from "node:assert/strict";
import { HttpError, toHttpErrorResponse } from "./errors.js";

test("toHttpErrorResponse converts HttpError into JSON response", async () => {
  const response = toHttpErrorResponse(new HttpError(401, "missing_bearer_token", "Missing Bearer token"));

  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: {
      code: "missing_bearer_token",
      message: "Missing Bearer token",
    },
  });
});

test("toHttpErrorResponse includes structured error data when present", async () => {
  const response = toHttpErrorResponse(new HttpError(400, "upstream_error", "Upstream rejected request", {
    param: "tools[0]",
    upstream: {
      message: "webSearchEnabled is false",
      code: "400",
    },
  }));

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: {
      code: "upstream_error",
      message: "Upstream rejected request",
      data: {
        param: "tools[0]",
        upstream: {
          message: "webSearchEnabled is false",
          code: "400",
        },
      },
    },
  });
});
