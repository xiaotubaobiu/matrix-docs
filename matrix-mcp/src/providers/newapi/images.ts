import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

let requestCounter = 0;

export function sanitizeOutputName(value: string) {
  return value
    .trim()
    .replace(/\.\.+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 80) || "image";
}

export async function generateImageViaNewApi(input: {
  baseUrl: string;
  token: string;
  model: string;
  outputDir: string;
  prompt: string;
  size: string;
  quality: string;
  outputName?: string;
  timeoutMs: number;
}) {
  const controller = new AbortController();
  const timeout = input.timeoutMs > 0 ? setTimeout(() => controller.abort(), input.timeoutMs) : undefined;
  try {
    const response = await fetch(`${input.baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        size: input.size,
        quality: input.quality,
        n: 1,
        response_format: "b64_json",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Image generation upstream returned HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const image = data?.data?.[0]?.b64_json;
    if (!image) throw new Error("Image generation upstream did not return b64_json");

    await mkdir(input.outputDir, { recursive: true });
    const stem = sanitizeOutputName(input.outputName ?? input.prompt.slice(0, 48));
    requestCounter += 1;
    const path = join(input.outputDir, `${Date.now()}-${requestCounter}-${stem}.png`);
    await writeFile(path, Buffer.from(image, "base64"));

    let serverFileDeleted = false;
    try {
      await unlink(path);
      serverFileDeleted = true;
    } catch {
      serverFileDeleted = false;
    }

    return {
      path,
      image,
      mimeType: "image/png",
      model: input.model,
      size: input.size,
      quality: input.quality,
      serverFileDeleted,
      text: serverFileDeleted
        ? "Generated image and returned it to the client. Server copy was deleted."
        : `Generated image and returned it to the client. Failed to delete server copy at ${path}.`,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
