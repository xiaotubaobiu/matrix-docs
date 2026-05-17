import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createGenerateImageTool } from "./generate-image.js";

test("generate_image tool exposes expected name", () => {
  const tool = createGenerateImageTool({} as any);
  assert.equal(tool.name, "generate_image");
  assert.equal(typeof tool.call, "function");
});

test("generate_image calls new-api image endpoint with caller token", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "matrix-image-mcp-"));
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; token: string; payload: Record<string, unknown> }> = [];

  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      token: String((init?.headers as Record<string, string>).Authorization),
      payload: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("png").toString("base64") }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const tool = createGenerateImageTool({
      newApiBaseUrl: "https://matrix.000328.xyz:2053",
      imageModel: "gpt-image-2",
      imageOutputDir: outputDir,
      requestTimeoutMs: 1000,
    });

    const result = await tool.call({
      prompt: "a clean product render",
      size: "1024x1024",
      quality: "high",
      output_name: "render",
    }, { token: "sk-user" });

    assert.equal(calls[0].url, "https://matrix.000328.xyz:2053/v1/images/generations");
    assert.equal(calls[0].token, "Bearer sk-user");
    assert.equal(calls[0].payload.model, "gpt-image-2");
    assert.equal(calls[0].payload.prompt, "a clean product render");
    assert.equal(calls[0].payload.quality, "high");
    assert.match(String(result.content?.[0]?.text ?? ""), /returned it to the client/);
    assert.deepEqual(result.content?.[1], {
      type: "image",
      data: Buffer.from("png").toString("base64"),
      mimeType: "image/png",
    });
    assert.equal(result.structuredContent.server_file_deleted, true);
    assert.deepEqual(await readdir(outputDir), []);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("generate_image defaults to low quality for faster responses", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "matrix-image-mcp-"));
  const originalFetch = globalThis.fetch;
  const calls: Array<{ payload: Record<string, unknown> }> = [];

  globalThis.fetch = async (_input, init) => {
    calls.push({ payload: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("png").toString("base64") }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const tool = createGenerateImageTool({
      newApiBaseUrl: "https://matrix.000328.xyz:2053",
      imageModel: "gpt-image-2",
      imageOutputDir: outputDir,
      requestTimeoutMs: 1000,
    });

    await tool.call({
      prompt: "a fast image",
    }, { token: "sk-user" });

    assert.equal(calls[0].payload.quality, "low");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("generate_image maps fast quality to low upstream", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "matrix-image-mcp-"));
  const originalFetch = globalThis.fetch;
  const calls: Array<{ payload: Record<string, unknown> }> = [];

  globalThis.fetch = async (_input, init) => {
    calls.push({ payload: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("png").toString("base64") }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const tool = createGenerateImageTool({
      newApiBaseUrl: "https://matrix.000328.xyz:2053",
      imageModel: "gpt-image-2",
      imageOutputDir: outputDir,
      requestTimeoutMs: 1000,
    });

    await tool.call({
      prompt: "a fast image",
      quality: "fast",
    }, { token: "sk-user" });

    assert.equal(calls[0].payload.quality, "low");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("generate_image returns pending for slow upstream and returns image on follow-up", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "matrix-image-mcp-"));
  const originalFetch = globalThis.fetch;
  let resolveFetch: ((response: Response) => void) | undefined;
  const upstream = new Promise<Response>((resolve) => {
    resolveFetch = resolve;
  });

  globalThis.fetch = async () => upstream;

  try {
    const tool = createGenerateImageTool({
      newApiBaseUrl: "https://matrix.000328.xyz:2053",
      imageModel: "gpt-image-2",
      imageOutputDir: outputDir,
      requestTimeoutMs: 1000,
    });

    const pending = await tool.call({
      prompt: "a slow image",
      wait_ms: 1,
    }, { token: "sk-user" });

    assert.equal(pending.content?.[0]?.type, "text");
    assert.equal(pending.structuredContent.status, "pending");
    assert.equal(typeof pending.structuredContent.job_id, "string");
    const jobId = String(pending.structuredContent.job_id);

    resolveFetch?.(new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("png").toString("base64") }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const completed = await tool.call({
      job_id: jobId,
      wait_ms: 1000,
    }, { token: "sk-user" });

    assert.equal(completed.structuredContent.status, "completed");
    assert.deepEqual(completed.content?.[1], {
      type: "image",
      data: Buffer.from("png").toString("base64"),
      mimeType: "image/png",
    });
    assert.equal(completed.structuredContent.server_file_deleted, true);
    assert.deepEqual(await readdir(outputDir), []);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("generate_image does not expose pending jobs across bearer tokens", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "matrix-image-mcp-"));
  const originalFetch = globalThis.fetch;
  let resolveFetch: ((response: Response) => void) | undefined;
  const upstream = new Promise<Response>((resolve) => {
    resolveFetch = resolve;
  });
  globalThis.fetch = async () => upstream;

  try {
    const tool = createGenerateImageTool({
      newApiBaseUrl: "https://matrix.000328.xyz:2053",
      imageModel: "gpt-image-2",
      imageOutputDir: outputDir,
      requestTimeoutMs: 1000,
    });

    const pending = await tool.call({
      prompt: "a private image",
      wait_ms: 1,
    }, { token: "sk-owner" });

    const denied = await tool.call({
      job_id: String(pending.structuredContent.job_id),
      wait_ms: 1,
    }, { token: "sk-other" });

    assert.equal(denied.isError, true);
    assert.match(String(denied.content?.[0]?.text ?? ""), /not found/i);

    resolveFetch?.(new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("png").toString("base64") }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await tool.call({
      job_id: String(pending.structuredContent.job_id),
      wait_ms: 1000,
    }, { token: "sk-owner" });
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputDir, { recursive: true, force: true });
  }
});
