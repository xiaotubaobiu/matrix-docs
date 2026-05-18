import test from "node:test";
import assert from "node:assert/strict";
import { newApiRequest } from "./client.js";
import { verifyNewApiToken } from "./token.js";
import { HttpError } from "../../server/errors.js";

test("newApiRequest sends bearer auth and JSON body", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await newApiRequest({
      baseUrl: "https://matrix.example",
      path: "/api/token/test",
      token: "abc123",
      method: "POST",
      body: { hello: "world" },
      timeoutMs: 1000,
    });

    assert.equal(response.status, 200);
    assert.equal(capturedUrl, "https://matrix.example/api/token/test");
    assert.equal(capturedInit?.method, "POST");
    assert.equal((capturedInit?.headers as Record<string, string>).Authorization, "Bearer abc123");
    assert.equal((capturedInit?.headers as Record<string, string>)["Content-Type"], "application/json");
    assert.equal(capturedInit?.body, JSON.stringify({ hello: "world" }));
    assert.ok(capturedInit?.signal instanceof AbortSignal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verifyNewApiToken rejects unauthorized upstream response", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(null, { status: 401 });

  try {
    await assert.rejects(
      () => verifyNewApiToken({
        baseUrl: "https://matrix.example",
        verifyPath: "/api/token/test",
        token: "bad-token",
        timeoutMs: 1000,
      }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 401);
        assert.equal(error.code, "invalid_token");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verifyNewApiToken rejects non-ok non-auth upstream response", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(null, { status: 500 });

  try {
    await assert.rejects(
      () => verifyNewApiToken({
        baseUrl: "https://matrix.example",
        verifyPath: "/api/token/test",
        token: "token",
        timeoutMs: 1000,
      }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 502);
        assert.equal(error.code, "token_verification_failed");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verifyNewApiToken accepts ok upstream response", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(null, { status: 204 });

  try {
    await assert.doesNotReject(() => verifyNewApiToken({
      baseUrl: "https://matrix.example",
      verifyPath: "/api/token/test",
      token: "good-token",
      timeoutMs: 1000,
    }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
