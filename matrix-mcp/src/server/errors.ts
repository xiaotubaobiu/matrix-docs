import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function normalizeHttpError(error: unknown): HttpError | undefined {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const path = firstIssue?.path?.length ? firstIssue.path.join(".") : "input";
    return new HttpError(400, "invalid_request", `${path}: ${firstIssue?.message ?? "Invalid input"}`);
  }

  return undefined;
}

export function toHttpErrorResponse(error: unknown): Response {
  const normalized = normalizeHttpError(error);
  if (normalized) {
    return Response.json(
      {
        error: {
          code: normalized.code,
          message: normalized.message,
          ...(normalized.data ? { data: normalized.data } : {}),
        },
      },
      { status: normalized.status },
    );
  }

  return Response.json(
    {
      error: {
        code: "internal_error",
        message: errorText(error),
      },
    },
    { status: 500 },
  );
}
