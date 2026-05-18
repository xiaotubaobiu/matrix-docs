import { z } from "zod";
import { generateImageViaNewApi } from "../providers/newapi/images.js";
import { toolErrorResult, toolImageResult, toolTextResult } from "../util/output.js";

const qualityValues = ["fast", "low", "medium", "high", "auto", "standard", "hd"] as const;
type ToolQuality = (typeof qualityValues)[number];
type UpstreamQuality = Exclude<ToolQuality, "fast">;
const defaultWaitMs = 60000;
const maxWaitMs = 60000;

const validator = z.object({
  prompt: z.string().min(1).optional(),
  job_id: z.string().min(1).optional(),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024", "auto"]).default("1024x1024"),
  quality: z.enum(qualityValues).default("low"),
  output_name: z.string().min(1).optional(),
  wait_ms: z.number().int().min(0).max(maxWaitMs).default(defaultWaitMs),
}).refine((input) => Boolean(input.prompt) !== Boolean(input.job_id), {
  message: "Provide exactly one of prompt or job_id",
  path: ["prompt"],
});

type ImageJobResult = Awaited<ReturnType<typeof generateImageViaNewApi>>;
type ImageJob = {
  id: string;
  ownerToken: string;
  createdAt: number;
  state: "pending" | "completed" | "failed";
  promise: Promise<void>;
  result?: ImageJobResult;
  error?: string;
};

const jobs = new Map<string, ImageJob>();
let jobCounter = 0;

function normalizeQuality(quality: ToolQuality): UpstreamQuality {
  if (quality === "fast") return "low";
  return quality;
}

function createJob(input: Parameters<typeof generateImageViaNewApi>[0], ownerToken: string): ImageJob {
  jobCounter += 1;
  const id = `${Date.now()}-${jobCounter.toString(36)}`;
  const job: ImageJob = {
    id,
    ownerToken,
    createdAt: Date.now(),
    state: "pending",
    promise: Promise.resolve(),
  };

  job.promise = generateImageViaNewApi(input).then(
    (result) => {
      job.state = "completed";
      job.result = result;
    },
    (error: unknown) => {
      job.state = "failed";
      job.error = error instanceof Error ? error.message : String(error);
    },
  );

  jobs.set(id, job);
  return job;
}

async function waitForJob(job: ImageJob, waitMs: number) {
  if (job.state !== "pending" || waitMs <= 0) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      job.promise,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, waitMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function formatJobResult(job: ImageJob) {
  if (job.state === "pending") {
    return toolTextResult(
      `Image generation is still running. Call generate_image again with job_id "${job.id}" to retrieve it.`,
      {
        status: "pending",
        job_id: job.id,
        retry_after_ms: 5000,
      },
    );
  }

  jobs.delete(job.id);

  if (job.state === "failed") {
    return toolErrorResult(`Image generation failed: ${job.error ?? "unknown error"}`);
  }

  const result = job.result;
  if (!result) {
    return toolErrorResult("Image generation failed: missing completed result");
  }

  return toolImageResult({
    text: result.text,
    data: result.image,
    mimeType: result.mimeType,
    structuredContent: {
      status: "completed",
      job_id: job.id,
      transient_path: result.path,
      server_file_deleted: result.serverFileDeleted,
      model: result.model,
      size: result.size,
      quality: result.quality,
    },
  });
}

export function createGenerateImageTool(config: any) {
  return {
    name: "generate_image",
    description: "Generate one image with gpt-image-2 and return it to the MCP client. If the image is still running, the tool returns a job_id; call generate_image again with that job_id to retrieve the image. Prefer fast or low for normal requests; high can take several minutes.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Prompt for a new image job." },
        job_id: { type: "string", description: "Existing image job id returned by a pending response." },
        size: { type: "string", enum: ["1024x1024", "1024x1536", "1536x1024", "auto"] },
        quality: {
          type: "string",
          enum: [...qualityValues],
          default: "low",
          description: "Use fast/low for normal requests. fast maps to low upstream.",
        },
        output_name: { type: "string" },
        wait_ms: {
          type: "number",
          minimum: 0,
          maximum: maxWaitMs,
          default: defaultWaitMs,
          description: "Maximum time to wait before returning pending. Keep this under the MCP client timeout.",
        },
      },
      anyOf: [{ required: ["prompt"] }, { required: ["job_id"] }],
      additionalProperties: false,
    },
    async call(arguments_: Record<string, unknown>, context: { token: string }) {
      const input = validator.parse(arguments_);
      if (input.job_id) {
        const job = jobs.get(input.job_id);
        if (!job) {
          return toolErrorResult("Image job not found");
        }
        if (job.ownerToken !== context.token) {
          return toolErrorResult("Image job not found for this token");
        }
        await waitForJob(job, input.wait_ms);
        return formatJobResult(job);
      }

      const quality = normalizeQuality(input.quality);
      const job = createJob({
        baseUrl: config.newApiBaseUrl,
        token: context.token,
        model: config.imageModel,
        outputDir: config.imageOutputDir,
        prompt: input.prompt!,
        size: input.size,
        quality,
        outputName: input.output_name,
        timeoutMs: config.requestTimeoutMs,
      }, context.token);
      await waitForJob(job, input.wait_ms);
      return formatJobResult(job);
    },
  };
}
